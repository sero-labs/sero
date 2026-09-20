/**
 * Pausing a project must stop its maintenance Workflow starting new runs.
 *
 * Before this, pause only stopped the owner being woken: the maintenance
 * Workflow stayed armed on its GitHub and CI triggers, so a paused project
 * could still start work. Disarming sets each trigger off; it never touches a
 * run already in flight, which pause has always been required to leave alone.
 *
 * The triggers this disarmed are recorded on the dispatch, so resume re-arms
 * exactly those and leaves off any the user turned off by hand.
 */

import { requestOrchestratorAction } from '@sero-ai/common';
import { MAINTENANCE_MILESTONE_ID } from '../shared/maintenance';
import type { Milestone, ProjectRecord } from '../shared/record';
import type { RecordStore } from './record-store';
import { mutateRecord } from './record-store';

/** The maintenance Workflow's dispatch, when the project has one. */
function maintenanceDispatch(record: ProjectRecord): Milestone | undefined {
  const milestone = record.milestones.find((m) => m.id === MAINTENANCE_MILESTONE_ID);
  return milestone?.dispatch?.kind === 'workflow' ? milestone : undefined;
}

export interface ArmingOutcome {
  /** What to tell the user beyond the pause or resume itself. Empty when it all worked. */
  note: string;
}

/**
 * Disarms the maintenance Workflow. Returns what to add to the pause message:
 * a failure is reported rather than swallowed, because a user who is told the
 * project is paused must not be left with a Workflow that can still fire.
 */
export async function disarmMaintenance(store: RecordStore, record: ProjectRecord): Promise<ArmingOutcome> {
  const milestone = maintenanceDispatch(record);
  const dispatch = milestone?.dispatch;
  if (!milestone || !dispatch) return { note: '' };

  const result = await requestOrchestratorAction(dispatch.workspaceId, {
    kind: 'set_armed',
    loopId: dispatch.id,
    armed: false,
    owner: { projectId: record.id },
  });
  if (!result.ok) {
    return { note: ` The maintenance Workflow could not be paused with it: ${result.error ?? 'the Orchestrator refused the change'}.` };
  }
  const disarmed = result.changedTriggerIds ?? [];
  if (disarmed.length > 0) {
    await mutateRecord(store, record.id, (fresh) => ({
      record: {
        ...fresh,
        milestones: fresh.milestones.map((m) => (m.id === milestone.id && m.dispatch
          ? { ...m, dispatch: { ...m.dispatch, disarmedTriggerIds: disarmed } }
          : m)),
      },
    }));
  }
  return { note: ' Its maintenance Workflow is paused with it.' };
}

/** Re-arms exactly the triggers a pause disarmed, and forgets them. */
export async function rearmMaintenance(store: RecordStore, record: ProjectRecord): Promise<ArmingOutcome> {
  const milestone = maintenanceDispatch(record);
  const dispatch = milestone?.dispatch;
  const triggerIds = dispatch?.disarmedTriggerIds ?? [];
  if (!milestone || !dispatch || triggerIds.length === 0) return { note: '' };

  const result = await requestOrchestratorAction(dispatch.workspaceId, {
    kind: 'set_armed',
    loopId: dispatch.id,
    armed: true,
    triggerIds,
    owner: { projectId: record.id },
  });
  if (!result.ok) {
    return { note: ` The maintenance Workflow could not be armed again: ${result.error ?? 'the Orchestrator refused the change'}.` };
  }
  await mutateRecord(store, record.id, (fresh) => ({
    record: {
      ...fresh,
      milestones: fresh.milestones.map((m) => {
        if (m.id !== milestone.id || !m.dispatch) return m;
        const { disarmedTriggerIds: _restored, ...rest } = m.dispatch;
        return { ...m, dispatch: rest };
      }),
    },
  }));
  return { note: ' Its maintenance Workflow is armed again.' };
}
