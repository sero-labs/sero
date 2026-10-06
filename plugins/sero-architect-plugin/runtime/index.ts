import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';

import { architectEnabled } from '../shared/kill-switch';
import { mayWakeForWork } from '../shared/lifecycle';
import { MAINTENANCE_MILESTONE_ID } from '../shared/maintenance';
import type { ProjectRecord } from '../shared/record';
import { normalizeIndex } from '../shared/types';
import type { WakeEvent } from '../shared/wake';
import { createDispatchWatch, type DispatchWatch } from './dispatch-watch';
import { createArchitectHost, type ArchitectHost } from './host';
import { releaseProjectWork } from './linked-work';
import { retryMilestone } from './work-recovery-actions';
import { createOwnerActions, type OwnerActions, type OwnerServices } from './owner-actions';
import { OwnerSessions } from './owner-session';
import { createProjectsActions, type ProjectsActions } from './projects-actions';
import { ARCHITECT_OWNER_LIVE_TOPIC } from '../shared/feedback';
import { createWorkWatch, type WorkWatch } from './work-watch';
import { createRecordStore, type RecordStore } from './record-store';
import { reconcileProjects } from './reconcile';
import { ensureInitialRun } from './run-lifecycle';
import { createRunJournal } from './run-journal';
import { openMaintenanceRun } from './run-lifecycle';
import { createSpanRecorder } from './spans';
import { registerArchitectRuntime, unregisterArchitectRuntime, type ArchitectRegistryEntry } from './registry';
import { activeDirectMilestone, interruptDirectExecutions } from '../shared/direct-execution';
import { createServices } from './services';
import { markRuntimeRunning, SESSION_STARTED_AT } from './session-state';
import { createTurnOutcomes } from './turn-outcomes';
import { createWakeGate, type WakeGate } from './wake-gate';
import { createWakeScheduler, type WakeScheduler } from './wake-scheduler';

/** Work the owner could do now without anything running: a quiet project with this wakes once. */
export function plannedWorkRemains(record: ProjectRecord): boolean {
  if (record.phase !== 'build' && record.phase !== 'release' && record.phase !== 'maintain') return false;
  // Work the owner does itself runs only while it has a turn, so it remains to be done.
  if (activeDirectMilestone(record)) return true;
  // The recurring maintenance subscription only reads product files and writes internal triage notes.
  if (record.milestones.some((m) => m.id !== MAINTENANCE_MILESTONE_ID && (m.status === 'running' || m.pendingDispatch))) return false;
  return record.milestones.some((m) =>
    m.status === 'approved'
    || (m.status === 'planned' && (record.autonomy !== 'milestones'
      || (m.openSpecChange && !m.plan && !record.pendingResearch?.some((entry) => entry.openSpecChange === m.openSpecChange))))
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
  private workWatch: WorkWatch | null = null;
  private services: OwnerServices | null = null;
  readonly gate: WakeGate = createWakeGate();
  scheduler: WakeScheduler | null = null;
  owner: OwnerActions | null = null;
  projects: ProjectsActions | null = null;

  constructor(private readonly host: ArchitectHost, private readonly env: NodeJS.ProcessEnv = process.env) {}

  /**
   * Records in the index whether the runtime is running in this Sero session.
   *
   * It is written on both paths of start, including the kill-switch one, and
   * again on dispose. A reader needs to tell "no report yet" from "nobody is
   * there to report", and only this process knows which.
   */
  private async markRuntime(running: boolean): Promise<void> {
    markRuntimeRunning(running);
    try {
      await this.host.updateIndex((current) => ({
        ...normalizeIndex(current),
        runtime: { running, startedAt: SESSION_STARTED_AT },
      }));
    } catch (error) {
      this.host.log(`could not record the runtime state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async start(): Promise<void> {
    // Disabled by the kill switch: records are kept and nothing is woken. The
    // list still needs to know nobody is running, so the flag is written first.
    if (!architectEnabled(this.env)) {
      await this.markRuntime(false);
      return;
    }
    await this.markRuntime(true);
    const homeDir = await this.host.homeDir();
    const store = createRecordStore({ homeDir, indexFile: this.host.indexFile, updateIndex: this.host.updateIndex });
    // Detailed telemetry lives beside the records, under the same profile home.
    const journal = createRunJournal({ homeDir });
    // Semantic spans name what an operation is. The runtime decides, a model never does.
    const spans = createSpanRecorder({ journal, now: () => this.host.now(), log: (message) => this.host.log(message) });
    this.store = store;
    const outcomes = createTurnOutcomes();
    const workWatch = createWorkWatch({
      sessions: () => this.host.persistentSessions,
      ownerHandle: (projectId) => this.sessions?.liveHandle(projectId),
      read: (projectId) => store.read(projectId),
      emit: (notice) => this.host.emitUi(ARCHITECT_OWNER_LIVE_TOPIC, notice),
      now: () => Date.now(),
    });
    this.workWatch = workWatch;
    const sessions = new OwnerSessions({ host: this.host, store, outcomes, journal, spans, onHandle: (projectId) => workWatch.ownerChanged(projectId) });
    this.sessions = sessions;
    const scheduler = createWakeScheduler({
      gate: this.gate,
      deliver: (projectId, wake) => this.deliver(projectId, wake),
      log: this.host.log,
    });
    this.scheduler = scheduler;
    const wake = (projectId: string, event: WakeEvent) => scheduler.request(projectId, event);
    const watch = createDispatchWatch({
      host: this.host,
      store,
      wake,
      journal,
      openMaintenanceRun: async (projectId, objectiveId) => {
        await openMaintenanceRun({ store, journal }, projectId, { objectiveId }, this.host.now(), `run-${objectiveId}`);
      },
      releaseHeld: async (projectId) => {
        const record = await store.read(projectId);
        if (record) await releaseProjectWork({ store, now: () => this.host.now(), retryWorkflow: (id, milestoneId, maxCostUsd) => retryMilestone({ store }, id, milestoneId, maxCostUsd) }, record);
      },
    });
    this.watch = watch;
    const services = createServices({ host: this.host, store, wake, spans, journal });
    this.services = services;
    this.owner = createOwnerActions({ host: this.host, store, outcomes, services });
    this.projects = createProjectsActions({ host: this.host, store, sessions, scheduler, watch, services, journal, workWatch });
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
        // A project that entered discovery without its initial run (the second
        // write failed) gets it here, before any wake can charge usage.
        let repaired = fresh;
        if (fresh.phase !== 'intake') {
          const opened = await ensureInitialRun({ store, journal }, fresh.id, this.host.now()).then(
            () => true,
            (error: unknown) => {
              this.host.log(`could not open the initial run for ${fresh.id}: ${error instanceof Error ? error.message : String(error)}`);
              return false;
            },
          );
          // Recovery must see the run it will charge, so it reads the record
          // after the repair, and does not start when the repair failed.
          if (!opened) continue;
          const reread = await store.read(fresh.id);
          if (!reread) {
            this.host.log(`could not re-read ${fresh.id} after opening its initial run; recovery skipped`);
            continue;
          }
          repaired = reread;
        }
        services.recoverPending(repaired);
        // A restart ended any turn the owner was working in. The work is kept
        // and resumes under its saved identity; it is never taken as complete.
        repaired = (await store.update(repaired.id, (current) => interruptDirectExecutions(current, 'Sero restarted while this work was in progress'))) ?? repaired;
        if (plannedWorkRemains(repaired)) scheduler.request(repaired.id, { kind: 'quiet', at: this.host.now(), items: ['restart found planned work and nothing running'] });
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
    if (record.phase === 'maintain' && wake.kind === 'directive') {
      const directive = record.directives.find((entry) => !entry.reply);
      if (directive) {
        await openMaintenanceRun({ store }, projectId, { objectiveId: directive.id }, this.host.now(), `run-${directive.id}`);
        record = await store.read(projectId) ?? record;
      }
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
    // A turn that was stopped, failed or timed out did not finish its work.
    const after = result.status === 'completed' ? result.record
      : (await store.update(projectId, (current) => interruptDirectExecutions(current, `the owner turn ended as ${result.status}`))) ?? result.record;
    // The owner asked for another turn on its own work. Directives, answers and
    // work events queued meanwhile go first, and a pause, block or cap holds it.
    const direct = activeDirectMilestone(after);
    if (result.declared === 'continue' && direct?.direct && mayWakeForWork(after)) {
      this.scheduler?.request(projectId, { kind: 'continue', at: this.host.now(), items: [`continue milestone ${direct.id} "${direct.title}" (execution ${direct.direct.id})`] });
    }
    if (result.retry && mayWakeForWork(after)) {
      this.scheduler?.request(projectId, { kind: 'quiet', at: this.host.now(), items: ['your last turn passed its 10 minute limit and was stopped; the record holds what was done, so continue from it in shorter steps'] });
    }
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
    await this.markRuntime(false);
    if (this.registered) unregisterArchitectRuntime(this.registered);
    this.watch?.dispose();
    this.workWatch?.dispose();
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
