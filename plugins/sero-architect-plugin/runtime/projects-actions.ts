/**
 * The user's management surface: create, pause, resume, stop, raise cap, set
 * autonomy, approve, answer, directive and delete. The UI and the
 * `architect_projects` tool both call this. Every write goes through the
 * store, and every change the owner must hear about becomes a wake.
 */

import os from 'node:os';
import path from 'node:path';

import { advancePhase, approveCharter, block, pause, resume, setAutonomy, setCap, settle, unblock } from '../shared/lifecycle';
import { createProjectRecord, toIndexEntry, type AutonomySetting, type DecisionProposal, type Milestone, type ProjectRecord } from '../shared/record';
import type { DispatchDestination } from '../shared/owner-actions';
import { performDispatch } from './dispatch-link';
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
  list(): Promise<ArchitectIndexEntry[]>;
  show(projectId: string): Promise<ProjectRecord | null>;
  create(input: { idea: string; folder: string }): Promise<ProjectsOutcome>;
  pause(projectId: string): Promise<ProjectsOutcome>;
  resume(projectId: string): Promise<ProjectsOutcome>;
  stop(projectId: string): Promise<ProjectsOutcome>;
  raiseCap(projectId: string, capUsd: number): Promise<ProjectsOutcome>;
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
  const charter = { ...proposal.charter, approvedAt: now };
  return {
    ...record,
    charter,
    milestones: proposal.milestones,
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
        const milestone = record.milestones.find((m) => m.id === proposal.milestoneId);
        if (!milestone || milestone.status === 'running' || milestone.status === 'done') return record;
        const { record: dispatched } = await performDispatch(store, services, record, milestone, {
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
  const advanceIntake = async (start: ProjectRecord): Promise<{ ok: true; record: ProjectRecord } | { ok: false; error: string }> => {
    let record = start;
    if (!record.workspaceId) {
      try {
        const workspace = await host.createWorkspace(record.name, path.dirname(record.folder));
        const init = await host.exec('git', ['init'], workspace.path);
        if (init.exitCode !== 0) throw new Error(`git init failed: ${init.stderr.trim() || init.stdout.trim()}`);
        record = (await store.update(record.id, (fresh) => ({
          ...fresh, folder: workspace.path, workspaceId: workspace.id, stateLine: 'Workspace ready. Waiting for the owner session grant.',
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

    async create(input) {
      const idea = input.idea.trim();
      if (!idea) return refuse('The idea is required.');
      const folder = expandHome(input.folder.trim());
      if (!input.folder.trim()) return refuse('The folder is required.');
      const name = path.basename(folder);
      const record = createProjectRecord({ id: host.newId('proj'), name, idea, folder, now: host.now() });
      await store.write(record);
      const outcome = await advanceIntake(record);
      if (!outcome.ok) return refuse(`The project was created but its workspace could not be: ${outcome.error}`);
      if (outcome.record.blockedReason) {
        return { ok: true, text: `Project ${record.id} created, but ${outcome.record.blockedReason}. It stays in intake until the grant is approved; resume to ask again.`, projectId: record.id };
      }
      return ok(`Project ${record.id} "${name}" created in ${outcome.record.folder}. Discovery starts.`, record.id);
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
        if (!record.paused && record.blockedReason === null && record.phase !== 'intake') {
          return { error: 'The project is not paused, blocked or waiting in intake.' };
        }
        const unpaused = record.paused ? resume(record, now) : null;
        let next = unpaused?.ok ? unpaused.record : record;
        if (next.blockedReason !== null) {
          const cleared = unblock(next, now, `user resumed: ${next.blockedReason}`);
          if (cleared.ok) next = cleared.record;
        }
        return { record: next };
      });
      if (!resumed.ok) return refuse(resumed.error);
      const next = resumed.record;
      if (next.phase === 'intake' || !next.session.grantId) {
        const outcome = await advanceIntake(next);
        if (!outcome.ok) return refuse(outcome.error);
        if (outcome.record.blockedReason) return refuse(outcome.record.blockedReason);
        return ok(`Project ${projectId} resumed. Discovery starts.`);
      }
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
        return { record: settle({ ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? approved : m)) }, now) };
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
          milestones: record.milestones.map((m) =>
            m.parkedBy === decisionId ? { ...m, status: m.parkedFrom ?? 'planned', parkedBy: null, parkedFrom: null } : m,
          ),
        }, now);
        next = { ...next, history: [...next.history, { at: now, phase: next.phase, overlay: next.overlay, cause: `decision ${decisionId} answered: ${optionId}` }] };
        return { record: next };
      });
      if (!answered.ok) return refuse(answered.error);
      // The answer is on disk before anything it proposes runs, so a failed
      // dispatch never loses the user's decision.
      if (proposal && optionId === 'apply') await applyProposal(answered.record, proposal, now);
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
