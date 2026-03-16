import type { Column, KanbanState } from './types';
import { updateCard } from './state-helpers';
import { maintainWorkspaceForNewCard } from './worktree-maintenance';
import { collectPersistedCardFixes } from './persisted-state-reconcile';
import { appStateManager } from '../app-state';
import type { WorktreeManager } from './worktree-manager';

export async function isYoloModeEnabled(stateFilePath: string): Promise<boolean> {
  return ((await appStateManager.read(stateFilePath) as KanbanState | null)?.settings?.yoloMode) === true;
}

export async function runWorkspaceMaintenance(
  stateFilePath: string,
  workspacePath: string,
  state: KanbanState | null,
  worktreeManager: WorktreeManager,
): Promise<void> {
  const maintenance = await maintainWorkspaceForNewCard(
    workspacePath,
    state,
    worktreeManager,
  );
  for (const cleanedCardId of maintenance.cleanedCardIds) {
    await updateCard(stateFilePath, cleanedCardId, {
      worktreePath: undefined,
      branch: undefined,
    });
  }
  if (!maintenance.sync.synced && maintenance.sync.reason) {
    console.log(`[kanban-orchestrator] Workspace sync skipped: ${maintenance.sync.reason}`);
  }
}

export async function reconcilePersistedState(
  stateFilePath: string,
  lastColumnMap: Map<string, Column>,
  state: KanbanState | null,
): Promise<void> {
  for (const fix of await collectPersistedCardFixes(state)) {
    if (fix.update.column) lastColumnMap.set(fix.id, fix.update.column);
    await updateCard(stateFilePath, fix.id, fix.update);
  }
}
