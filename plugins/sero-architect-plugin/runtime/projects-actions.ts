/**
 * The user's management surface: create, pause, resume, stop, raise cap, set
 * autonomy, approve, answer, directive and delete. The UI and the
 * `architect_projects` tool both call this. Every write goes through the
 * store, and every change the owner must hear about becomes a wake.
 */

import { chooseOwnerModel } from './owner-session';
import os from 'node:os';
import path from 'node:path';

import { requestOrchestratorAction, type PersistentSessionHistoryPage } from '@sero-ai/common';

import { advancePhase, approveCharter, block, mayDispatch, pause, resume, setAutonomy, setCap, settle, unblock } from '../shared/lifecycle';
import { createProjectRecord, toIndexEntry, type AutonomySetting, type ExecutionMode, type DecisionProposal, type Milestone, type ProjectRecord } from '../shared/record';
import type { DispatchDestination } from '../shared/owner-actions';
import { performDispatch, recoverDispatch } from './dispatch-link';
import { repairDispatch, type RepairOutcome } from './repair-dispatch';
import type { OwnerServices } from './owner-actions';
import type { ArchitectIndexEntry } from '../shared/types';
import type { ArchitectHost } from './host';
import type { OwnerSessions } from './owner-session';
import { mutateRecord, type RecordStore } from './record-store';
import type { WakeScheduler } from './wake-scheduler';
import type { DispatchWatch } from './dispatch-watch';

export const STOP_REASON = 'stopped by the user';

export interface ProjectsActionsDeps {
  host: ArchitectHost;
  store: RecordStore;
  sessions: OwnerSessions;
  scheduler: WakeScheduler;
  watch: DispatchWatch;
  services: OwnerServices;
}

export type ProjectsOutcome = { ok: true; text: string; projectId?: string } | { ok: false; text: string };

export interface ProjectsActions {
  preview(projectId: string): Promise<ProjectsOutcome & { url?: string }>;
  repair(projectId: string, workflowId?: string): Promise<RepairOutcome>;
  list(): Promise<ArchitectIndexEntry[]>;
  show(projectId: string): Promise<ProjectRecord | null>;
  history(projectId: string, cursor?: string): Promise<PersistentSessionHistoryPage | null>;
  create(input: { idea: string; folder: string; executionMode?: ExecutionMode }): Promise<ProjectsOutcome>;
  pause(projectId: string): Promise<ProjectsOutcome>;
  resume(projectId: string): Promise<ProjectsOutcome>;
  retry(projectId: string, milestoneId: string, maxCostUsd?: number): Promise<ProjectsOutcome>;
  stop(projectId: string): Promise<ProjectsOutcome>;
  raiseCap(projectId: string, capUsd: number): Promise<ProjectsOutcome>;
  setExecutionMode(projectId: string, mode: ExecutionMode): Promise<ProjectsOutcome>;
  setAutonomy(projectId: string, autonomy: AutonomySetting): Promise<ProjectsOutcome>;
  approve(projectId: string, target: 'charter' | 'milestone', milestoneId?: string): Promise<ProjectsOutcome>;
  answer(projectId: string, decisionId: string, optionId: string, note?: string): Promise<ProjectsOutcome>;
  directive(projectId: string, text: string): Promise<ProjectsOutcome>;
  delete(projectId: string): Promise<ProjectsOutcome>;
}

const ok = (text: string, projectId?: string): ProjectsOutcome => ({ ok: true, text, projectId });
const refuse = (text: string): ProjectsOutcome => ({ ok: false, text });

function expandHome(folder: string): string {
  return folder.startsWith('~') ? path.join(os.homedir(), folder.slice(1)) : path.resolve(folder);
}

/** Applies a charter-change proposal the user accepted. Their acceptance is the approval. */
function applyCharterProposal(record: ProjectRecord, proposal: Extract<DecisionProposal, { kind: 'charter' }>, now: string): ProjectRecord {
  const existing = new Map(record.milestones.map((milestone) => [milestone.id, milestone]));
  const proposed = proposal.milestones.map((milestone) => {
    const current = existing.get(milestone.id);
    if (!current) return milestone;
    return {
      ...milestone,
      status: current.status,
      dispatch: current.dispatch,
      pendingDispatch: current.pendingDispatch,
      evidence: current.evidence,
      verification: current.verification,
      parkedBy: current.parkedBy,
      parkedFrom: current.parkedFrom,
      parkedByDecisions: current.parkedByDecisions,
      receipt: current.receipt,
    };
  });
  const proposedIds = new Set(proposed.map((milestone) => milestone.id));
  const retained = record.milestones.filter((milestone) =>
    !proposedIds.has(milestone.id) && (milestone.dispatch !== null || milestone.pendingDispatch !== undefined || milestone.status === 'running' || milestone.status === 'verifying' || milestone.status === 'done'),
  );
  const milestones = [...proposed, ...retained];
  const charter = { ...proposal.charter, milestoneIds: milestones.map((milestone) => milestone.id), approvedAt: now };
  return {
    ...record,
    charter,
    milestones,
    autonomy: charter.autonomy,
    budget: { ...record.budget, capUsd: charter.capUsd },
  };
}

export function createProjectsActions(deps: ProjectsActionsDeps): ProjectsActions {
  const { host, store, sessions, scheduler, watch, services } = deps;

  /**
   * What the user's `apply` means for each forced escalation. Nothing here runs
   * on `keep`. It runs after the answer is written, never inside the store's
   * write queue, because a dispatch calls out to the Orchestrator and then
   * writes the link itself.
   */
  const applyProposal = async (record: ProjectRecord, proposal: DecisionProposal, now: string): Promise<ProjectRecord> => {
    switch (proposal.kind) {
      case 'charter':
        return (await store.update(record.id, (fresh) => settle(applyCharterProposal(fresh, proposal, now), now))) ?? record;
      case 'cap':
        return (await store.update(record.id, (fresh) => {
          const raised = setCap(fresh, proposal.capUsd, now);
          return raised.ok ? raised.record : null;
        })) ?? record;
      case 'dispatch': {
        const current = await store.read(record.id);
        if (!current) throw new Error(`No project ${record.id}.`);
        if (!mayDispatch(current)) throw new Error(current.overlay ? `The project is ${current.overlay}; no new dispatch may start.` : `The project is in ${current.phase}; no dispatch may start.`);
        const milestone = current.milestones.find((m) => m.id === proposal.milestoneId);
        if (!milestone || milestone.status === 'parked' || milestone.status === 'running' || milestone.status === 'verifying' || milestone.status === 'done') {
          throw new Error(`Milestone ${proposal.milestoneId} is not available for dispatch.`);
        }
        if (milestone.status === 'planned' && current.autonomy === 'milestones') throw new Error(`Milestone ${milestone.id} still needs plan approval.`);
        const { record: dispatched } = await performDispatch(store, services, current, milestone, {
          kind: proposal.dispatchKind, prompt: proposal.prompt, destination: proposal.destination as DispatchDestination, maxCostUsd: null,
        }, now);
        return dispatched;
      }
    }
  };

  /**
   * Intake, re-entrant: does whatever the record still lacks (workspace, grant,
   * phase) and nothing it already has, so create, resume and a restart all take
   * the same path and an interruption is never permanent.
   */
  const advanceIntake = async (start: ProjectRecord, requestPermission = true): Promise<{ ok: true; record: ProjectRecord } | { ok: false; error: string }> => {
    let record = start;
    if (!record.workspaceId) {
      try {
        const workspace = await host.createWorkspace(record.name, path.dirname(record.folder));
        record = (await store.update(record.id, (fresh) => ({
          ...fresh, folder: workspace.path, workspaceId: workspace.id, stateLine: 'Workspace ready. Permission is needed to run the Architect.',
        }))) ?? record;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await store.update(record.id, (fresh) => {
          const blocked = block(fresh, host.now(), `the workspace could not be created: ${reason}`);
          return blocked.ok ? blocked.record : null;
        });
        return { ok: false, error: reason };
      }
    }
    try {
      const init = await host.exec('git', ['init'], record.folder);
      if (init.exitCode !== 0) throw new Error(`git init failed: ${init.stderr.trim() || init.stdout.trim()}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await store.update(record.id, (fresh) => {
        const blocked = block(fresh, host.now(), reason);
        return blocked.ok ? { ...blocked.record, stateLine: 'Project setup failed. Retry to continue.' } : null;
      });
      return { ok: false, error: reason };
    }
    if (!requestPermission) return { ok: true, record };
    if (!record.session.grantId) {
      record = await sessions.requestGrant(record);
      if (record.blockedReason) return { ok: true, record };
    }
    if (record.phase === 'intake') {
      let failure = '';
      const advanced = await store.update(record.id, (fresh) => {
        const result = advancePhase({ ...fresh, stateLine: 'Discovering the project.' }, 'discovery', host.now(), 'workspace registered and owner grant approved');
        if (result.ok) return result.record;
        failure = result.error;
        return null;
      });
      if (!advanced) return { ok: false, error: failure || `No project ${record.id}.` };
      record = advanced;
    }
    await watch.track(record);
    scheduler.request(record.id, { kind: 'quiet', at: host.now(), items: ['intake finished; discovery starts'] });
    return { ok: true, record };
  };

  const read = async (projectId: string): Promise<ProjectRecord | null> => store.read(projectId);

  return {
    async list() {
      return (await store.list()).map(toIndexEntry);
    },

    show: read,

    async preview(projectId) {
      const record = await read(projectId);
      if (!record?.workspaceId) return refuse('This project has no workspace.');
      const command = await host.detectDevServerCommand(record.folder);
      if (!command) return refuse('No preview command was found in the project workspace.');
      const server = await host.startDevServer({ workspaceId: record.workspaceId,
        workspacePath: record.folder, cwdPath: record.folder, command, name: record.name, scope: 'workspace' });
      return server.url ? { ok: true, text: 'Project preview is running.', url: server.url }
        : refuse(server.reason ?? 'The preview could not start.');
    },

    async repair(projectId, workflowId) {
      const pending = await store.read(projectId);
      if (pending?.milestones.some((item) => item.pendingDispatch?.request)) {
        try {
          return await recoverDispatch(store, services, pending)
            ? { ok: true, text: 'Workflow recovered. Checking progress.' }
            : { ok: false, text: 'Workflow recovery is waiting for the project pause, budget or decision to be resolved.' };
        } catch (error) {
          return { ok: false, text: error instanceof Error ? error.message : String(error) };
        }
      }
      const result = await repairDispatch(store, host, projectId, workflowId);
      if (result.ok && workflowId) {
        watch.untrack(projectId);
        const record = await store.read(projectId);
        if (record) await watch.track(record);
      }
      return result;
    },

    async retry(projectId, milestoneId, maxCostUsd) {
      const record = await read(projectId);
      const milestone = record?.milestones.find((item) => item.id === milestoneId);
      const dispatch = milestone?.dispatch;
      if (!record || !milestone || dispatch?.kind !== 'workflow' || !dispatch.failure) return refuse('This milestone has no interrupted Workflow to retry.');
      if (record.paused) return refuse('Resume the project before retrying its work.');
      if (record.budget.capUsd !== null && record.budget.spentUsd >= record.budget.capUsd) return refuse('Raise the project cap before retrying.');
      if (record.blockedReason && record.blockedReason !== dispatch.failure) return refuse(record.blockedReason);
      if (dispatch.costLimitUsd !== undefined) {
        if (maxCostUsd === undefined || !Number.isFinite(maxCostUsd) || maxCostUsd <= dispatch.chargedUsd) return refuse('Approve a finite Workflow cap above its recorded spend.');
        const available = record.budget.capUsd === null ? 0 : Math.max(0, record.budget.capUsd - record.budget.spentUsd);
        if (maxCostUsd > dispatch.chargedUsd + available) return refuse('Raise the project cap first. This Workflow allocation exceeds the remaining project budget.');
        const changed = await requestOrchestratorAction(dispatch.workspaceId, { kind: 'use_cost_budget', loopId: dispatch.id, maxCostUsd });
        if (!changed.ok) return refuse(changed.error ?? 'The Workflow cap could not change.');
        const started = await requestOrchestratorAction(dispatch.workspaceId, { kind: 'run_next', loopId: dispatch.id });
        return started.ok ? ok(`Workflow resumed with a $${maxCostUsd} cap.`) : refuse(started.error ?? 'The Workflow could not resume.');
      }
      const result = await requestOrchestratorAction(dispatch.workspaceId, dispatch.retryStepId
        ? { kind: 'retry_step', loopId: dispatch.id, stepId: dispatch.retryStepId }
        : { kind: 'retry', loopId: dispatch.id });
      return result.ok ? ok(`Retry started for ${milestone.title}.`) : refuse(result.error ?? 'The Workflow could not retry.');
    },

    async history(projectId, cursor) {
      const record = await read(projectId);
      if (!record?.session.grantId || !host.persistentSessions) return null;
      return host.persistentSessions.readHistory(record.session.grantId, record.session.subject, { cursor, limit: 100 });
    },

    async create(input) {
      const idea = input.idea.trim();
      if (!idea) return refuse('The idea is required.');
      const folder = expandHome(input.folder.trim());
      if (!input.folder.trim()) return refuse('The folder is required.');
      const name = path.basename(folder);
      const record = createProjectRecord({ id: host.newId('proj'), name, idea, folder, executionMode: input.executionMode, now: host.now() });
      await store.write(record);
      const outcome = await advanceIntake(record, false);
      if (!outcome.ok) return ok(`Project saved. Setup needs attention: ${outcome.error}`, record.id);
      if (outcome.record.blockedReason) {
        return { ok: true, text: `Project ${record.id} created, but ${outcome.record.blockedReason}. It stays in intake until the grant is approved; resume to ask again.`, projectId: record.id };
      }
      return ok(`Project ${record.id} "${name}" created in ${outcome.record.folder}. Permission is needed to run the Architect.`, record.id);
    },

    async setExecutionMode(projectId, mode) {
      const saved = await mutateRecord(store, projectId, (record) => {
        if (record.executionMode === mode) return { record };
        if (record.session.workingSince || (record.executionMode !== undefined && record.session.turns > 0)) {
          return { error: 'Execution location is fixed once the project starts.' };
        }
        return { record: settle({ ...record, executionMode: mode, history: [...record.history, { at: host.now(), phase: record.phase, overlay: record.overlay, cause: `execution location set to ${mode}` }] }, host.now()) };
      });
      return saved.ok ? ok(`Execution location saved: ${mode}. Existing workers keep their directories.`) : refuse(saved.error);
    },

    async pause(projectId) {
      // In-flight Workflows and Rooms keep running under their own limits.
      const paused = await mutateRecord(store, projectId, (record) => {
        const result = pause(record, host.now());
        return result.ok ? { record: result.record } : { error: result.error };
      });
      if (!paused.ok) return refuse(paused.error);
      return ok(`Project ${projectId} paused. Running work continues; the owner is not woken until resume.`);
    },

    async resume(projectId) {
      const now = host.now();
      // Resume is the user's one exit from every stop: a pause, the user's own
      // stop, a refused grant, a missing workspace, or an owner that gave up.
      const resumed = await mutateRecord(store, projectId, (record) => {
        if (!record.executionMode) return { error: 'Choose Workspace or Worktree in project settings before resuming.' };
        if (!record.paused && record.blockedReason === null && record.phase !== 'intake') {
          return { error: 'The project is not paused, blocked or waiting in intake.' };
        }
        const unpaused = record.paused ? resume(record, now) : null;
        let next = unpaused?.ok ? unpaused.record : record;
        if (next.blockedReason !== null) {
          const cleared = unblock(next, now, `user resumed: ${next.blockedReason}`);
          if (cleared.ok) next = { ...cleared.record, stateLine: 'Continuing the project.' };
        }
        return { record: next };
      });
      if (!resumed.ok) return refuse(resumed.error);
      let next = resumed.record;
      const selected = await chooseOwnerModel(host);
      if (next.session.grantId && (next.session.model !== selected.model || next.session.thinking !== selected.thinking)) {
        await sessions.dispose(projectId);
        next = await sessions.requestGrant(next);
        if (next.blockedReason) return refuse(next.blockedReason);
      }
      if (next.phase === 'intake' || !next.session.grantId) {
        const outcome = await advanceIntake(next);
        if (!outcome.ok) return refuse(outcome.error);
        if (outcome.record.blockedReason) return refuse(outcome.record.blockedReason);
        return ok(`Project ${projectId} resumed. Discovery starts.`);
      }
      services.recoverPending(next);
      scheduler.request(projectId, { kind: 'quiet', at: now, items: ['the user resumed the project'] });
      return ok(`Project ${projectId} resumed.`);
    },

    async stop(projectId) {
      const stopped = await mutateRecord(store, projectId, (record) => {
        if (record.blockedReason === STOP_REASON) return { error: 'The project is already stopped.' };
        const result = block(record, host.now(), STOP_REASON);
        return result.ok ? { record: result.record } : { error: result.error };
      });
      if (!stopped.ok) return refuse(stopped.error);
      scheduler.forget(projectId);
      await sessions.dispose(projectId);
      return ok(`Project ${projectId} stopped. Running work continues under its own limits; the owner session is closed.`);
    },

    async raiseCap(projectId, capUsd) {
      let wasLimited = false;
      const result = await mutateRecord(store, projectId, (record) => {
        wasLimited = record.overlay === 'limited';
        const raised = setCap(record, capUsd, host.now());
        return raised.ok ? { record: raised.record } : { error: raised.error };
      });
      if (!result.ok) return refuse(result.error);
      if (wasLimited && result.record.overlay !== 'limited') {
        scheduler.request(projectId, { kind: 'decision', at: host.now(), items: [`the user raised the cap to $${capUsd}`] });
      }
      return ok(`Cap set to $${capUsd}.`);
    },

    async setAutonomy(projectId, autonomy) {
      const result = await mutateRecord(store, projectId, (record) => {
        const set = setAutonomy(record, autonomy, host.now());
        return set.ok ? { record: set.record } : { error: set.error };
      });
      if (!result.ok) return refuse(result.error);
      return ok(`Autonomy set to ${autonomy}; it applies to the next milestone.`);
    },

    async approve(projectId, target, milestoneId) {
      const now = host.now();
      if (target === 'charter') {
        const result = await mutateRecord(store, projectId, (record) => {
          const approved = approveCharter(record, now);
          if (!approved.ok) return { error: approved.error };
          const building = advancePhase({ ...approved.record, stateLine: 'Building.' }, 'build', now, 'charter approved; build starts');
          return building.ok ? { record: building.record } : { error: building.error };
        });
        if (!result.ok) return refuse(result.error);
        scheduler.request(projectId, { kind: 'decision', at: now, items: ['the user approved the charter; build starts'] });
        return ok('Charter approved. Build starts.');
      }
      const result = await mutateRecord(store, projectId, (record) => {
        const milestone = record.milestones.find((m) => m.id === milestoneId);
        if (!milestone) return { error: `Milestone "${milestoneId ?? ''}" is not on this project.` };
        if (milestone.status !== 'planned') return { error: `Milestone ${milestone.id} is ${milestone.status}, not planned.` };
        if (!milestone.plan) return { error: `Milestone ${milestone.id} has no plan to approve yet.` };
        const approved: Milestone = { ...milestone, status: 'approved' };
        const settled = settle({ ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? approved : m)) }, now);
        return { record: { ...settled, history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause: `user approved milestone ${milestone.id}` }] } };
      });
      if (!result.ok) return refuse(result.error);
      scheduler.request(projectId, { kind: 'decision', at: now, items: [`the user approved the plan for milestone ${milestoneId ?? ''}`] });
      return ok(`Milestone ${milestoneId ?? ''} approved for dispatch.`);
    },

    async answer(projectId, decisionId, optionId, note) {
      const now = host.now();
      let proposal: DecisionProposal | null = null;
      const answered = await mutateRecord(store, projectId, (record) => {
        const decision = record.decisions.find((d) => d.id === decisionId);
        if (!decision) return { error: `No decision ${decisionId} on this project.` };
        if (decision.answer) return { error: `Decision ${decisionId} is already answered.` };
        if (!decision.options.some((o) => o.id === optionId)) return { error: `"${optionId}" is not an option of decision ${decisionId}.` };
        proposal = decision.proposal;
        const withAnswer = { ...decision, answer: { optionId, note: note?.trim() || null, answeredAt: now } };
        let next: ProjectRecord = settle({
          ...record,
          decisions: record.decisions.map((d) => (d.id === decisionId ? withAnswer : d)),
          milestones: record.milestones.map((m) => {
            const blockers = m.parkedByDecisions ?? (m.parkedBy ? [m.parkedBy] : []);
            if (!blockers.includes(decisionId)) return m;
            const remaining = blockers.filter((id) => id !== decisionId);
            return remaining.length > 0
              ? { ...m, parkedBy: remaining[0] ?? null, parkedByDecisions: remaining }
              : { ...m, status: m.parkedFrom ?? 'planned', parkedBy: null, parkedByDecisions: [], parkedFrom: null };
          }),
        }, now);
        next = { ...next, history: [...next.history, { at: now, phase: next.phase, overlay: next.overlay, cause: `decision ${decisionId} answered: ${optionId}` }] };
        return { record: next };
      });
      if (!answered.ok) return refuse(answered.error);
      if (proposal && optionId === 'apply') {
        try {
          await applyProposal(answered.record, proposal, now);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          await store.update(projectId, (fresh) => {
            const decisions = fresh.decisions.map((decision) => decision.id === decisionId ? { ...decision, answer: null } : decision);
            const milestones = fresh.milestones.map((milestone) => {
              if (!fresh.decisions.find((decision) => decision.id === decisionId)?.dependsOn.includes(milestone.id)) return milestone;
              const parkedByDecisions = [...new Set([...(milestone.parkedByDecisions ?? (milestone.parkedBy ? [milestone.parkedBy] : [])), decisionId])];
              return { ...milestone, status: 'parked' as const, parkedBy: parkedByDecisions[0] ?? decisionId, parkedByDecisions, parkedFrom: milestone.parkedFrom ?? milestone.status };
            });
            return settle({ ...fresh, decisions, milestones }, now);
          });
          scheduler.request(projectId, { kind: 'decision', at: now, items: [`decision ${decisionId} could not be applied: ${reason}`] });
          return refuse(`Decision ${decisionId} was not applied: ${reason}. It remains open so the user can retry.`);
        }
      }
      scheduler.request(projectId, { kind: 'decision', at: now, items: [`the user answered decision ${decisionId} with "${optionId}"${note?.trim() ? ' and left a note' : ''}`] });
      return ok(`Decision ${decisionId} answered with "${optionId}".`);
    },

    async directive(projectId, text) {
      const body = text.trim();
      if (!body) return refuse('The directive is empty.');
      const now = host.now();
      const id = host.newId('dir');
      const sent = await store.update(projectId, (record) => settle({ ...record, directives: [...record.directives, { id, text: body, sentAt: now, reply: null }] }, now));
      if (!sent) return refuse(`No project ${projectId}.`);
      scheduler.request(projectId,{ kind: 'directive', at: now, items: [`directive ${id}`] });
      return ok(`Directive ${id} sent. The owner replies on its next wake.`);
    },

    async delete(projectId) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      scheduler.forget(projectId);
      watch.untrack(projectId);
      await sessions.dispose(projectId);
      if (record.session.grantId && host.persistentSessions) {
        await host.persistentSessions.deleteGrant(record.session.grantId).catch((error: unknown) => {
          host.log(`could not delete grant ${record.session.grantId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      await store.remove(projectId);
      return ok(`Project ${projectId} deleted. Its folder and workspace are kept.`);
    },
  };
}
