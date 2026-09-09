import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';

import { architectEnabled } from '../shared/kill-switch';
import { mayWakeForWork } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import { createDispatchWatch, type DispatchWatch } from './dispatch-watch';
import { createArchitectHost, type ArchitectHost } from './host';
import { createOwnerActions, type OwnerActions, type OwnerServices } from './owner-actions';
import { OwnerSessions } from './owner-session';
import { createProjectsActions, type ProjectsActions } from './projects-actions';
import { createRecordStore, type RecordStore } from './record-store';
import { reconcileProjects } from './reconcile';
import { registerArchitectRuntime, unregisterArchitectRuntime, type ArchitectRegistryEntry } from './registry';
import { createServices } from './services';
import { createTurnOutcomes } from './turn-outcomes';
import { createWakeGate, type WakeGate } from './wake-gate';
import { createWakeScheduler, type WakeScheduler } from './wake-scheduler';

/** Work the owner could do now without anything running: a quiet project with this wakes once. */
export function plannedWorkRemains(record: ProjectRecord): boolean {
  if (record.phase !== 'build' && record.phase !== 'release' && record.phase !== 'maintain') return false;
  if (record.milestones.some((m) => m.status === 'running' || m.pendingDispatch)) return false;
  return record.milestones.some((m) =>
    m.status === 'approved'
    || (m.status === 'planned' && record.autonomy !== 'milestones')
    || (m.status === 'verifying' && m.evidence?.passed === true && !m.evidence.stale),
  );
}

/**
 * The Architect runtime: profile-global, started once, bound to the synthetic
 * `global` workspace. It owns the project records, the wake scheduler, the
 * budget and the verification gate.
 */
export class ArchitectRuntime implements AppRuntime {
  private store: RecordStore | null = null;
  private registered: ArchitectRegistryEntry | null = null;
  private watch: DispatchWatch | null = null;
  private sessions: OwnerSessions | null = null;
  private services: OwnerServices | null = null;
  readonly gate: WakeGate = createWakeGate();
  scheduler: WakeScheduler | null = null;
  owner: OwnerActions | null = null;
  projects: ProjectsActions | null = null;

  constructor(private readonly host: ArchitectHost, private readonly env: NodeJS.ProcessEnv = process.env) {}

  async start(): Promise<void> {
    // Disabled by the kill switch: records are kept and nothing is woken.
    if (!architectEnabled(this.env)) return;
    const homeDir = await this.host.homeDir();
    const store = createRecordStore({ homeDir, indexFile: this.host.indexFile, updateIndex: this.host.updateIndex });
    this.store = store;
    const outcomes = createTurnOutcomes();
    const sessions = new OwnerSessions({ host: this.host, store, outcomes });
    this.sessions = sessions;
    const scheduler = createWakeScheduler({
      gate: this.gate,
      deliver: (projectId, wake) => this.deliver(projectId, wake),
      log: this.host.log,
    });
    this.scheduler = scheduler;
    const wake = (projectId: string, event: WakeEvent) => scheduler.request(projectId, event);
    const watch = createDispatchWatch({ host: this.host, store, wake });
    this.watch = watch;
    const services = createServices({ host: this.host, store, wake });
    this.services = services;
    this.owner = createOwnerActions({ host: this.host, store, outcomes, services });
    this.projects = createProjectsActions({ host: this.host, store, sessions, scheduler, watch, services });
    this.registered = { owner: this.owner, projects: this.projects };
    registerArchitectRuntime(this.registered);

    // Reconcile before the gate opens, so no wake can run on unconfirmed state.
    const { records, held } = await reconcileProjects(store, this.host);
    if (held.length > 0) this.host.log(`held ${held.length} project(s) whose workspace is missing: ${held.join(', ')}`);
    for (const record of records) {
      // A blocked owner still needs updates from its existing work. Otherwise
      // a workflow resumed after restart can never clear the old failure.
      if (record.workspaceId) await watch.track(record);
      const fresh = await store.read(record.id);
      if (!fresh) continue;
      const lastWakeAt = fresh.session.lastWakeAt ?? '';
      const unanswered = fresh.directives.filter((directive) => directive.reply === null);
      if (unanswered.length > 0) {
        scheduler.request(fresh.id, { kind: 'directive', at: this.host.now(), items: unanswered.map((directive) => `directive ${directive.id} awaits a reply after restart`) });
      }
      const answered = fresh.decisions.filter((decision) => decision.answer && decision.answer.answeredAt > lastWakeAt);
      const approvals = fresh.history.filter((entry) => entry.at > lastWakeAt && entry.cause.includes('approved'));
      if (answered.length > 0 || approvals.length > 0) {
        scheduler.request(fresh.id, {
          kind: 'decision',
          at: this.host.now(),
          items: [...answered.map((decision) => `decision ${decision.id} was answered before restart`), ...approvals.map((entry) => entry.cause)],
        });
      }
      if (mayWakeForWork(fresh)) {
        services.recoverPending(fresh);
        if (plannedWorkRemains(fresh)) scheduler.request(fresh.id, { kind: 'quiet', at: this.host.now(), items: ['restart found planned work and nothing running'] });
      }
    }
    this.gate.release();
  }

  /** The store, once started. Absent while disabled or before start. */
  records(): RecordStore | null {
    return this.store;
  }

  private async deliver(projectId: string, wake: WakeEvent): Promise<void> {
    const store = this.store;
    const sessions = this.sessions;
    if (!store || !sessions) return;
    let record = await store.read(projectId);
    if (!record) return;
    const allowed = wake.kind === 'directive' || wake.kind === 'decision' || mayWakeForWork(record);
    if (!allowed) {
      this.host.log(`project ${projectId} is ${record.overlay}; ${wake.kind} wake dropped`);
      return;
    }
    if (!record.session.grantId) {
      this.host.log(`project ${projectId} has no owner grant; ${wake.kind} wake dropped`);
      return;
    }
    // Entering maintain subscribes maintenance only after the current stop gates pass.
    if (record.phase === 'maintain' && this.services) {
      try {
        record = await this.services.maintenance(record);
      } catch (error) {
        this.host.log(`maintenance Workflow for ${projectId} could not be created: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const result = await sessions.runTurn(record, wake);
    const after = result.record;
    if (result.declared === 'sleep' && wake.kind !== 'quiet' && mayWakeForWork(after) && plannedWorkRemains(after)) {
      this.scheduler?.request(projectId, { kind: 'quiet', at: this.host.now(), items: ['nothing is running and planned work remains'] });
    }
    if (after.overlay === 'decision' && record.overlay !== 'decision') {
      this.host.notify(`${after.name} needs a decision.`, 'info');
    }
    if (after.blockedReason !== null && record.blockedReason === null) {
      this.host.notify(`${after.name} is blocked: ${after.blockedReason}`, 'warning');
    }
  }

  async handleStateChange(): Promise<void> {
    // The index is the runtime's own output; nothing to react to here.
  }

  async dispose(): Promise<void> {
    if (this.registered) unregisterArchitectRuntime(this.registered);
    this.watch?.dispose();
    await this.sessions?.disposeAll();
    this.store = null;
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new ArchitectRuntime(createArchitectHost(ctx));
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
