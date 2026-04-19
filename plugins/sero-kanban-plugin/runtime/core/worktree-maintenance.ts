import type { AppRuntimeWorkspaceSyncResult } from '@sero/common';
import type { KanbanRuntimeHost } from '../types';
import type { KanbanState } from './types';

export interface WorktreeMaintenanceResult {
  cleanedCardIds: string[];
  sync: AppRuntimeWorkspaceSyncResult;
}

export async function maintainWorkspaceForNewCard(
  host: Pick<KanbanRuntimeHost, 'git'>,
  workspacePath: string,
  state: KanbanState | null,
): Promise<WorktreeMaintenanceResult> {
  const cleanedCardIds = await cleanupMergedDoneCardWorktrees(host, workspacePath, state);
  const sync = await host.git.syncWorkspaceRootToDefaultBranch(workspacePath);
  return { cleanedCardIds, sync };
}

async function cleanupMergedDoneCardWorktrees(
  host: Pick<KanbanRuntimeHost, 'git'>,
  workspacePath: string,
  state: KanbanState | null,
): Promise<string[]> {
  if (!state?.cards?.length) return [];

  const cleanedCardIds: string[] = [];

  for (const card of state.cards) {
    if (card.column !== 'done' || !card.worktreePath || !card.prNumber) continue;

    const mergeState = await host.git.getPrMergeState(card.worktreePath, card.prNumber);
    if (mergeState !== 'merged') continue;

    await host.git.removeWorktree(workspacePath, card.id, {
      deleteBranch: true,
      force: true,
    });
    cleanedCardIds.push(card.id);
  }

  return cleanedCardIds;
}
