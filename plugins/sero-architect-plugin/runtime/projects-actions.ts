/**
 * The user's management surface: create, pause, resume, stop, raise cap, set
 * autonomy, approve, answer, directive and delete. The UI and the
 * `architect_projects` tool both call this. Every write goes through the
 * store, and every change the owner must hear about becomes a wake.
 */

import { chooseOwnerModel } from './owner-session';
import os from 'node:os';
import path from 'node:path';

import { requestOrchestratorAction, type ModelTier, type PersistentSessionHistoryPage, type SharedModelTierEntry, type SharedModelTierSettings, type ThinkingLevel } from '@sero-ai/common';

import { advancePhase, approveCharter, block, mayDispatch, pause, resume, setAutonomy, setCap, settle, unblock } from '../shared/lifecycle';
import { activityOptions } from './session-state';
import { createProjectRecord, toIndexEntry, type AutonomySetting, type CreateProjectInput, type ExecutionMode, type DecisionProposal, type Milestone, type ProjectRecord } from '../shared/record';
import type { DispatchDestination } from '../shared/owner-actions';
import { performDispatch } from './dispatch-link';
import { disarmMaintenance, rearmMaintenance } from './maintenance-arming';
import type { RepairOutcome } from './repair-dispatch';
import { clearModelDefaultAction, parseModelEntry, refreshModelTiersAction, setModelDefaultAction, type ModelDefaultInput } from './model-default-actions';
import { validateEntry } from './model-resolution';
import { setProjectTierOverride } from '../shared/model-config';
import { previewProject, repairProject, retryMilestone } from './work-recovery-actions';
import type { OwnerServices } from './owner-actions';
import type { ArchitectIndexEntry } from '../shared/types';
import type { ArchitectHost } from './host';
import type { OwnerSessions } from './owner-session';
import type { RecordStore } from './record-store';
import { mutateRecord } from './record-store';
import type { RunJournal } from './run-journal';
import { queryTrace, type TraceAnswer, type TraceQuery } from './trace-query';
import { closeActiveRun, ensureInitialRun } from './run-lifecycle';
import { closeDeliveredObjectives } from './objective-completion';
import { answerResearchAccess, restartsResearch } from './research-access';
import { applyDecisionProposal } from './decision-proposals';
import type { WakeScheduler } from './wake-scheduler';
import type { DispatchWatch } from './dispatch-watch';

export const STOP_REASON = 'stopped by the user';

/**
 * Feedback after a model change. It names the revision new work will use and
 * how many existing dispatches keep the earlier one, so the user can see which
 * work is unaffected by what they just saved.
 */
export interface ProjectsActionsDeps {
  host: ArchitectHost;
  store: RecordStore;
  sessions: OwnerSessions;
  scheduler: WakeScheduler;
  watch: DispatchWatch;
  services: OwnerServices;
  /** Detailed run journals, removed with the project on the explicit deletion path. */
  journal?: RunJournal;
}

export type ProjectsOutcome = { ok: true; text: string; projectId?: string } | { ok: false; text: string };

/** One tier default a caller asks to save. */

export interface ProjectsActions {
  preview(projectId: string): Promise<ProjectsOutcome & { url?: string }>;
  repair(projectId: string, workflowId?: string): Promise<RepairOutcome>;
  list(): Promise<ArchitectIndexEntry[]>;
  show(projectId: string): Promise<ProjectRecord | null>;
  history(projectId: string, cursor?: string): Promise<PersistentSessionHistoryPage | null>;
  /**
   * Reads a project's trace. Metadata-only unless `detail` is asked for, so a
   * page showing a summary never receives records it did not request.
   */
  trace(projectId: string, query?: Omit<TraceQuery, 'projectId'>): Promise<TraceAnswer | null>;
  create(input: CreateProjectInput): Promise<ProjectsOutcome>;
  pause(projectId: string): Promise<ProjectsOutcome>;
  resume(projectId: string): Promise<ProjectsOutcome>;
  retry(projectId: string, milestoneId: string, maxCostUsd?: number): Promise<ProjectsOutcome>;
  stop(projectId: string): Promise<ProjectsOutcome>;
  raiseCap(projectId: string, capUsd: number): Promise<ProjectsOutcome>;
  setExecutionMode(projectId: string, mode: ExecutionMode): Promise<ProjectsOutcome>;
  setAutonomy(projectId: string, autonomy: AutonomySetting): Promise<ProjectsOutcome>;
  /** Saves one project tier override. An unavailable model or thinking level is refused. */
  setModelDefault(projectId: string, input: ModelDefaultInput): Promise<ProjectsOutcome>;
  /** Clears one override so the tier inherits the global selection again. */
  clearModelDefault(projectId: string, tier: ModelTier): Promise<ProjectsOutcome>;
  /** Re-reads the host's global model tiers into the cached record, and returns what it read. */
  refreshModelTiers(projectId: string): Promise<ProjectsOutcome & { tiers?: SharedModelTierSettings }>;
  approve(projectId: string, target: 'charter' | 'milestone', milestoneId?: string): Promise<ProjectsOutcome>;
  answer(projectId: string, decisionId: string, optionId: string, note?: string): Promise<ProjectsOutcome>;
  directive(projectId: string, text: string): Promise<ProjectsOutcome>;
  delete(projectId: string): Promise<ProjectsOutcome>;
}

const ok = (text: string, projectId?: string): ProjectsOutcome => ({ ok: true, text, projectId });
const refuse = (text: string): ProjectsOutcome => ({ ok: false, text });

/** The default Sero workspace. It holds personal data, so it is never a project. */
const GLOBAL_WORKSPACE_ID = 'global';

function expandHome(folder: string): string {
  return folder.startsWith('~') ? path.join(os.homedir(), folder.slice(1)) : path.resolve(folder);
}


export function createProjectsActions(deps: ProjectsActionsDeps): ProjectsActions {
  const { host, store, sessions, scheduler, watch, services } = deps;


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
      // The initial run covers setup through initial delivery, so it opens before
      // discovery's first model call. Idempotent: a re-entered discovery keeps it.
      if (deps.journal) {
        await ensureInitialRun({ store, journal: deps.journal }, record.id, host.now()).catch((error: unknown) => {
          host.log(`could not open the initial run for ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
    await watch.track(record);
    scheduler.request(record.id, { kind: 'quiet', at: host.now(), items: ['intake finished; discovery starts'] });
    return { ok: true, record };
  };

  const read = async (projectId: string): Promise<ProjectRecord | null> => store.read(projectId);

  const recovery = { host, store, services, watch };

  return {
    async list() {
      return (await store.list()).map((record) => toIndexEntry(record, activityOptions()));
    },

    show: read,

    preview: (projectId) => previewProject(recovery, projectId),
    repair: (projectId, workflowId) => repairProject(recovery, projectId, workflowId),
    retry: (projectId, milestoneId, maxCostUsd) => retryMilestone(recovery, projectId, milestoneId, maxCostUsd),

    async history(projectId, cursor) {
      const record = await read(projectId);
      if (!record?.session.grantId || !host.persistentSessions) return null;
      return host.persistentSessions.readHistory(record.session.grantId, record.session.subject, { cursor, limit: 100 });
    },

    /**
     * Reads a trace only for a project that exists.
     *
     * The authorization is the record lookup, so a foreign id, a deleted project
     * and a typo are all the same answer: nothing.
     */
    async trace(projectId, query) {
      const journal = deps.journal;
      if (!journal) return null;
      return queryTrace({ journal, authorize: async (id) => (await read(id)) !== null }, { ...query, projectId });
    },

    async create(input) {
      const idea = input.idea.trim();
      if (!idea) return refuse('The idea is required.');
      const folderInput = input.folder?.trim() ?? '';
      const chosenWorkspaceId = input.workspaceId?.trim() ?? '';
      if (folderInput && chosenWorkspaceId) return refuse('Choose a new folder or an existing workspace, not both.');
      if (!folderInput && !chosenWorkspaceId) return refuse('Choose a new folder or an existing workspace.');

      let name: string;
      let folder: string;
      let workspaceId: string | null;
      if (chosenWorkspaceId) {
        const workspace = (await host.listWorkspaces()).find((candidate) => candidate.id === chosenWorkspaceId);
        if (!workspace) return refuse(`No workspace ${chosenWorkspaceId} is registered.`);
        if (workspace.id === GLOBAL_WORKSPACE_ID) return refuse('The Global workspace cannot hold an Architect project.');
        // One Architect project per workspace: new work goes to the project already there.
        if ((await store.list()).some((project) => project.workspaceId === workspace.id)) {
          return refuse(`${workspace.name} already has an Architect project.`);
        }
        name = workspace.name;
        folder = workspace.path;
        workspaceId = workspace.id;
      } else {
        folder = expandHome(folderInput);
        if (await host.fileInfo(folder)) {
          return refuse(`The folder ${folder} already exists. Choose another folder, or choose Existing workspace to use it.`);
        }
        name = path.basename(folder);
        workspaceId = null;
      }

      let record = createProjectRecord({ id: host.newId('proj'), name, idea, folder, workspaceId, executionMode: input.executionMode, now: host.now() });
      // Overrides chosen at intake are checked against the catalogue the same
      // way a later change is, so the first wake never resolves a model that
      // does not exist.
      if (input.models && input.models.length > 0) {
        const catalogue = await host.listModels();
        for (const choice of input.models) {
          const entry = parseModelEntry(choice);
          if (!entry) return refuse('Name the model as provider/modelId.');
          const checked = validateEntry(catalogue, entry);
          if (!checked.ok) return refuse(checked.error);
          record = setProjectTierOverride(record, choice.tier, entry);
        }
      }
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
      // Pausing the project pauses what it runs on a trigger. Work already in
      // flight is left alone, which is what pause has always promised.
      const disarmed = await disarmMaintenance(store, paused.record);
      return ok(`Project ${projectId} paused. Running work continues; the owner is not woken until resume.${disarmed.note}`);
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
          // The reason it was blocked is folded under the headline, so the entry
          // reads as the user's own act rather than a raw block sentence.
          const cleared = unblock(next, now, 'You resumed the project', undefined, next.blockedReason);
          if (cleared.ok) next = { ...cleared.record, stateLine: 'Continuing the project.' };
        }
        return { record: next };
      });
      if (!resumed.ok) return refuse(resumed.error);
      const rearmed = await rearmMaintenance(store, resumed.record);
      let next = (await store.read(projectId)) ?? resumed.record;
      const selected = await chooseOwnerModel(host, next);
      if (next.session.grantId && (next.session.model !== selected.model || next.session.thinking !== selected.thinking)) {
        await sessions.dispose(projectId);
        next = await sessions.requestGrant(next);
        if (next.blockedReason) return refuse(next.blockedReason);
      }
      if (next.phase === 'intake' || !next.session.grantId) {
        const outcome = await advanceIntake(next);
        if (!outcome.ok) return refuse(outcome.error);
        if (outcome.record.blockedReason) return refuse(outcome.record.blockedReason);
        return ok(`Project ${projectId} resumed. Discovery starts.${rearmed.note}`);
      }
      // Discovery may have been entered without its run if that second write
      // failed. Idempotent: a project that has one keeps it.
      if (deps.journal) {
        try {
          await ensureInitialRun({ store, journal: deps.journal }, projectId, now);
        } catch (error) {
          return refuse(`could not open the initial run for ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Recovery charges the run, so it must see the record that has it. A
        // stale record would charge nothing, so a failed re-read stops here.
        const reread = await store.read(projectId);
        if (!reread) return refuse(`Project ${projectId} could not be re-read after opening its initial run.`);
        next = reread;
      }
      services.recoverPending(next);
      scheduler.request(projectId, { kind: 'quiet', at: now, items: ['the user resumed the project'] });
      return ok(`Project ${projectId} resumed.${rearmed.note}`);
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
      // A Stop is not completion: the run ends as stopped, and any work that is
      // still in flight keeps its identity so its late usage stays attributable.
      if (deps.journal) {
        await closeActiveRun({ store, journal: deps.journal }, projectId, 'stopped', host.now()).catch((error: unknown) => {
          host.log(`could not close the active run for ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
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

    setModelDefault: (projectId, input) => setModelDefaultAction({ host, store }, projectId, input),
    clearModelDefault: (projectId, tier) => clearModelDefaultAction({ host, store }, projectId, tier),
    refreshModelTiers: (projectId) => refreshModelTiersAction({ host, store }, projectId),

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
        return {
          record: {
            ...settled,
            history: [...settled.history, {
              at: now,
              phase: settled.phase,
              overlay: settled.overlay,
              cause: 'approved',
              subject: { kind: 'milestone' as const, id: milestone.id, label: milestone.title },
            }],
          },
        };
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
        const chosen = decision.options.find((o) => o.id === optionId);
        const answerNote = note?.trim() || null;
        // The research effect lands in this same write, so a crash between
        // the answer and its effect cannot leave the entry pending and unanswerable.
        if (decision.proposal?.kind === 'research-access') next = closeDeliveredObjectives(settle(answerResearchAccess(next, decision.proposal.researchId, optionId), now), now);
        next = {
          ...next,
          history: [...next.history, {
            at: now,
            phase: next.phase,
            overlay: next.overlay,
            cause: `You answered Architect's question: ${chosen?.label ?? optionId}`,
            subject: { kind: 'decision' as const, id: decisionId, label: decision.question },
            ...(answerNote ? { detail: answerNote } : {}),
          }],
        };
        return { record: next };
      });
      if (!answered.ok) return refuse(answered.error);
      if (proposal && optionId === 'apply') {
        try {
          await applyDecisionProposal({ store, services }, answered.record, proposal, now);
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
      // Read back from the record: the closure above assigns `proposal` and
      // control-flow typing does not follow it.
      const applied = answered.record.decisions.find((decision) => decision.id === decisionId)?.proposal ?? null;
      if (applied?.kind === 'research-access' && restartsResearch(optionId)) services.restartResearch(answered.record, applied.researchId);
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
      // Detailed telemetry lives outside the record. Project deletion is the
      // existing explicit lifecycle that removes it; nothing expires on its own.
      if (deps.journal) {
        await deps.journal.removeProject(projectId).catch((error: unknown) => {
          host.log(`could not remove run journals for ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      return ok(`Project ${projectId} deleted. Its folder and workspace are kept.`);
    },
  };
}
