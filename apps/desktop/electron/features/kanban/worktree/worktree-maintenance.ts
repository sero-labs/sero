import type { KanbanState } from '../core/types';
import { getPullRequestMergeState } from '@electron/features/vcs/worktree/merge-status';
import {
  syncWorkspaceRootToDefaultBranch,
  type WorkspaceSyncResult,
} from '@electron/features/vcs/worktree/workspace-sync';

interface WorktreeRemover {
  remove: (
    workspacePath: string,
    cardId: string,
    opts?: { deleteBranch?: boolean; force?: boolean },
  ) => Promise<void>;
}

export interface WorktreeMaintenanceResult {
  cleanedCardIds: string[];
  sync: WorkspaceSyncResult;
}

export async function maintainWorkspaceForNewCard(
  workspacePath: string,
  state: KanbanState | null,
  worktreeRemover: WorktreeRemover,
): Promise<WorktreeMaintenanceResult> {
  const cleanedCardIds = await cleanupMergedDoneCardWorktrees(
    workspacePath,
    state,
    worktreeRemover,
  );
  const sync = await syncWorkspaceRootToDefaultBranch(workspacePath);
  return { cleanedCardIds, sync };
}

async function cleanupMergedDoneCardWorktrees(
  workspacePath: string,
  state: KanbanState | null,
  worktreeRemover: WorktreeRemover,
): Promise<string[]> {
  if (!state?.cards?.length) return [];

  const cleanedCardIds: string[] = [];

  for (const card of state.cards) {
    if (card.column !== 'done' || !card.worktreePath || !card.prNumber) continue;

    const mergeState = await getPullRequestMergeState(workspacePath, card.prNumber);
    if (mergeState !== 'merged') continue;

    await worktreeRemover.remove(workspacePath, card.id, {
      deleteBranch: true,
      force: true,
    });
    cleanedCardIds.push(card.id);
  }

  return cleanedCardIds;
}
