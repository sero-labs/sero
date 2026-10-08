import type { OrchestratorBoardCreateOptions, OrchestratorRoomCreateLimits } from '@sero-ai/common';
import { isActiveDirect } from '../shared/direct-execution';
import { MAINTENANCE_MILESTONE_ID } from '../shared/maintenance';
import type { ExecutionMode, MilestoneDispatch, ProjectRecord } from '../shared/record';

/** Older projects need a user setting before a new execution can be created. */
export function executionMode(record: ProjectRecord): ExecutionMode {
  if (!record.executionMode) throw new Error('Choose Workspace or Worktree in project settings before starting new work.');
  return record.executionMode;
}

export function workflowWorkspace(record: ProjectRecord): NonNullable<OrchestratorBoardCreateOptions['workspace']> {
  const isolated = executionMode(record) === 'worktree';
  return { useManagedWorktree: isolated, allowDirtyWorkspaceRoot: !isolated };
}

export function roomWorkspace(record: ProjectRecord): Pick<OrchestratorRoomCreateLimits, 'executionMode'> {
  return { executionMode: executionMode(record) };
}

/** Keep the legacy local-Workflow guard and include Rooms in Workspace runs. */
export function usesProjectFiles(record: ProjectRecord, dispatch: Pick<MilestoneDispatch, 'kind' | 'destination'>): boolean {
  return record.executionMode === 'workspace' || (dispatch.kind === 'workflow' && (!dispatch.destination || dispatch.destination === 'workspace-files'));
}

export function projectWriter(record: ProjectRecord, exceptMilestoneId?: string) {
  return record.milestones.find((item) => item.id !== exceptMilestoneId && item.id !== MAINTENANCE_MILESTONE_ID
    // The owner's own work edits the project folder only in Workspace mode: a
    // worktree execution has a checkout of its own.
    && (item.pendingDispatch || (isActiveDirect(item.direct) && item.direct.placement.mode === 'workspace') || (item.status === 'running' && item.dispatch && usesProjectFiles(record, item.dispatch))));
}
