/**
 * The user's management surface: create, pause, resume, stop, raise cap, set
 * autonomy, approve, answer, directive and delete. The UI and the
 * `architect_projects` tool both call this. Every write goes through the
 * store, and every change the owner must hear about becomes a wake.
 */

import os from 'node:os';
import path from 'node:path';

import { advancePhase, approveCharter, block, pause, resume, setAutonomy, setCap, settle, unblock } from '../shared/lifecycle';
import { createProjectRecord, toIndexEntry, type AutonomySetting, type Milestone, type ProjectRecord } from '../shared/record';
import type { ArchitectIndexEntry } from '../shared/types';
import type { ArchitectHost } from './host';
import type { OwnerSessions } from './owner-session';
import type { RecordStore } from './record-store';
import type { WakeScheduler } from './wake-scheduler';
import type { DispatchWatch } from './dispatch-watch';

export const STOP_REASON = 'stopped by the user';

export interface ProjectsActionsDeps {
  host: ArchitectHost;
  store: RecordStore;
  sessions: OwnerSessions;
  scheduler: WakeScheduler;
  watch: DispatchWatch;
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
function applyCharterProposal(record: ProjectRecord, proposal: NonNullable<ProjectRecord['decisions'][number]['proposal']>, now: string): ProjectRecord {
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
  const { host, store, sessions, scheduler, watch } = deps;

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
      const now = host.now();
      let record = createProjectRecord({ id: host.newId('proj'), name, idea, folder, now });
      await store.write(record);
      try {
        const workspace = await host.createWorkspace(name, path.dirname(folder));
        const init = await host.exec('git', ['init'], workspace.path);
        if (init.exitCode !== 0) throw new Error(`git init failed: ${init.stderr.trim() || init.stdout.trim()}`);
        record = { ...record, folder: workspace.path, workspaceId: workspace.id, stateLine: 'Workspace ready. Waiting for the owner session grant.' };
        await store.write(record);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const blocked = block(record, host.now(), `the workspace could not be created: ${reason}`);
        if (blocked.ok) await store.write(blocked.record);
        return refuse(`The project was created but its workspace could not be: ${reason}`);
      }
      record = await sessions.requestGrant(record);
      if (record.blockedReason) return { ok: true, text: `Project ${record.id} created, but ${record.blockedReason}. It stays in intake until the grant is approved.`, projectId: record.id };
      const advanced = advancePhase({ ...record, stateLine: 'Discovering the project.' }, 'discovery', host.now(), 'workspace registered and owner grant approved');
      if (!advanced.ok) return refuse(advanced.error);
      await store.write(advanced.record);
      await watch.track(advanced.record);
      scheduler.request(advanced.record.id, { kind: 'quiet', at: host.now(), items: ['the project was created; discovery starts'] });
      return ok(`Project ${advanced.record.id} "${name}" created in ${advanced.record.folder}. Discovery starts.`, advanced.record.id);
    },

    async pause(projectId) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const result = pause(record, host.now());
      if (!result.ok) return refuse(result.error);
      // In-flight Workflows and Rooms keep running under their own limits.
      await store.write(result.record);
      return ok(`Project ${projectId} paused. Running work continues; the owner is not woken until resume.`);
    },

    async resume(projectId) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const now = host.now();
      let result = record.blockedReason === STOP_REASON ? unblock(record, now, 'user resumed a stopped project') : resume(record, now);
      if (!result.ok) return refuse(result.error);
      await store.write(result.record);
      scheduler.request(projectId, { kind: 'quiet', at: now, items: ['the user resumed the project'] });
      return ok(`Project ${projectId} resumed.`);
    },

    async stop(projectId) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      if (record.blockedReason === STOP_REASON) return refuse('The project is already stopped.');
      const result = block(record, host.now(), STOP_REASON);
      if (!result.ok) return refuse(result.error);
      await store.write(result.record);
      scheduler.forget(projectId);
      await sessions.dispose(projectId);
      return ok(`Project ${projectId} stopped. Running work continues under its own limits; the owner session is closed.`);
    },

    async raiseCap(projectId, capUsd) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const wasLimited = record.overlay === 'limited';
      const result = setCap(record, capUsd, host.now());
      if (!result.ok) return refuse(result.error);
      await store.write(result.record);
      if (wasLimited && result.record.overlay !== 'limited') {
        scheduler.request(projectId, { kind: 'decision', at: host.now(), items: [`the user raised the cap to $${capUsd}`] });
      }
      return ok(`Cap set to $${capUsd}.`);
    },

    async setAutonomy(projectId, autonomy) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const result = setAutonomy(record, autonomy, host.now());
      if (!result.ok) return refuse(result.error);
      await store.write(result.record);
      return ok(`Autonomy set to ${autonomy}; it applies to the next milestone.`);
    },

    async approve(projectId, target, milestoneId) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const now = host.now();
      if (target === 'charter') {
        const approved = approveCharter(record, now);
        if (!approved.ok) return refuse(approved.error);
        const building = advancePhase({ ...approved.record, stateLine: 'Building.' }, 'build', now, 'charter approved; build starts');
        if (!building.ok) return refuse(building.error);
        await store.write(building.record);
        scheduler.request(projectId, { kind: 'decision', at: now, items: ['the user approved the charter; build starts'] });
        return ok('Charter approved. Build starts.');
      }
      const milestone = record.milestones.find((m) => m.id === milestoneId);
      if (!milestone) return refuse(`Milestone "${milestoneId ?? ''}" is not on this project.`);
      if (milestone.status !== 'planned') return refuse(`Milestone ${milestone.id} is ${milestone.status}, not planned.`);
      if (!milestone.plan) return refuse(`Milestone ${milestone.id} has no plan to approve yet.`);
      const approved: Milestone = { ...milestone, status: 'approved' };
      await store.write(settle({ ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? approved : m)) }, now));
      scheduler.request(projectId, { kind: 'decision', at: now, items: [`the user approved the plan for milestone ${milestone.id}`] });
      return ok(`Milestone ${milestone.id} approved for dispatch.`);
    },

    async answer(projectId, decisionId, optionId, note) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const decision = record.decisions.find((d) => d.id === decisionId);
      if (!decision) return refuse(`No decision ${decisionId} on this project.`);
      if (decision.answer) return refuse(`Decision ${decisionId} is already answered.`);
      if (!decision.options.some((o) => o.id === optionId)) return refuse(`"${optionId}" is not an option of decision ${decisionId}.`);
      const now = host.now();
      const answered = { ...decision, answer: { optionId, note: note?.trim() || null, answeredAt: now } };
      let next: ProjectRecord = {
        ...record,
        decisions: record.decisions.map((d) => (d.id === decisionId ? answered : d)),
        milestones: record.milestones.map((m) =>
          m.parkedBy === decisionId ? { ...m, status: m.parkedFrom ?? 'planned', parkedBy: null, parkedFrom: null } : m,
        ),
      };
      if (decision.proposal && optionId === 'apply') next = applyCharterProposal(next, decision.proposal, now);
      next = settle(next, now);
      next = { ...next, history: [...next.history, { at: now, phase: next.phase, overlay: next.overlay, cause: `decision ${decisionId} answered: ${optionId}` }] };
      await store.write(next);
      scheduler.request(projectId, { kind: 'decision', at: now, items: [`the user answered decision ${decisionId} with "${optionId}"${note?.trim() ? ' and left a note' : ''}`] });
      return ok(`Decision ${decisionId} answered with "${optionId}".`);
    },

    async directive(projectId, text) {
      const record = await read(projectId);
      if (!record) return refuse(`No project ${projectId}.`);
      const body = text.trim();
      if (!body) return refuse('The directive is empty.');
      const now = host.now();
      const id = host.newId('dir');
      await store.write(settle({ ...record, directives: [...record.directives, { id, text: body, sentAt: now, reply: null }] }, now));
      scheduler.request(projectId, { kind: 'directive', at: now, items: [`directive ${id}`] });
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
