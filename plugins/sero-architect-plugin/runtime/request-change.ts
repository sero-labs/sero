/** A user request becomes a durable Architect milestone and an OpenSpec change. */
import { appendHistory } from '../shared/lifecycle';
import { toMilestone } from '../shared/charter-shape';
import type { ProjectsOutcome } from './projects-actions';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';
import type { WakeScheduler } from './wake-scheduler';
import { newOpenSpecChange } from './openspec';
import { openMaintenanceRun } from './run-lifecycle';

export function createRequestChangeAction(deps: {
  host: ArchitectHost;
  store: RecordStore;
  scheduler: WakeScheduler;
  journal?: RunJournal;
}): (projectId: string, description: string) => Promise<ProjectsOutcome> {
  const { host, store, scheduler } = deps;
  return async (projectId, description) => {
    const request = description.trim();
    if (!request) return { ok: false, text: 'Describe the change you want.' };
    const record = await store.read(projectId);
    if (!record) return { ok: false, text: `No project ${projectId}.` };
    if (!record.openSpecEnabled) return { ok: false, text: 'OpenSpec was not enabled for this Architect project.' };
    if (record.phase !== 'maintain') return { ok: false, text: 'New OpenSpec changes start after the initial project reaches maintenance.' };
    if (record.paused || record.blockedReason || record.overlay === 'limited') return { ok: false, text: `The project is ${record.overlay ?? 'stopped'}; resume it before requesting a change.` };
    const now = host.now();
    const changeName = host.newId('architect-change').replace(/[^a-z0-9-]/g, '-');
    try {
      await newOpenSpecChange(host, record.folder, changeName);
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
    const run = await openMaintenanceRun({ store, journal: deps.journal }, projectId, { objectiveId: changeName }, now, `run-${changeName}`);
    const saved = await store.update(projectId, (fresh) => {
      const id = `m${fresh.milestones.length + 1}`;
      const milestone = { ...toMilestone({ title: request.slice(0, 100), plan: null, previewRoute: null }, id), openSpecChange: changeName,
        ...(run.runId ? { runId: run.runId } : {}) };
      return appendHistory({ ...fresh, milestones: [...fresh.milestones, milestone], stateLine: `Exploring: ${request.slice(0, 100)}.` }, now,
        'requested OpenSpec change', { kind: 'milestone', id, label: milestone.title }, request);
    });
    if (!saved) return { ok: false, text: `Project ${projectId} disappeared after creating OpenSpec change ${changeName}. The change remains in the workspace.` };
    scheduler.request(projectId, { kind: 'quiet', at: now, items: [`New OpenSpec change ${changeName} requested: ${request}. Explore it in a Room, then prepare its artifacts and implementation milestone.`] });
    return { ok: true, text: `Change ${changeName} requested. Architect will explore it in a Room, prepare the spec and ask for milestone approval.` };
  };
}
