import type { Column, KanbanState } from './types';
import { updateCard } from './state-helpers';
import { maintainWorkspaceForNewCard } from '../worktree/worktree-maintenance';
import { refreshWorkspaceRuntimeAfterSync } from '@electron/features/workspace/runtime/refresh-after-sync';
import { collectPersistedCardFixes } from './persisted-state-reconcile';
import { appStateManager } from '@electron/features/apps/state/manager';
import type { WorktreeManager } from '../worktree/worktree-manager';

export async function isYoloModeEnabled(stateFilePath: string): Promise<boolean> {
  return ((await appStateManager.read(stateFilePath) as KanbanState | null)?.settings?.yoloMode) === true;
}

export async function runWorkspaceMaintenance(
  workspaceId: string,
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
    return;
  }

  if (maintenance.sync.synced && maintenance.sync.headChanged) {
    const refresh = await refreshWorkspaceRuntimeAfterSync(workspaceId, workspacePath);
    if (refresh.installCommand && refresh.dependenciesInstalled) {
      console.log(`[kanban-orchestrator] Workspace dependencies refreshed via "${refresh.installCommand}"`);
    }
    if (refresh.restartedServerIds.length > 0) {
      console.log(
        `[kanban-orchestrator] Restarted ${refresh.restartedServerIds.length} dev server(s) after workspace sync`,
      );
    }
    if (refresh.autoStartedServerId) {
      console.log(`[kanban-orchestrator] Auto-started dev server ${refresh.autoStartedServerId} after workspace sync`);
    }
    if (refresh.reason) {
      console.log(`[kanban-orchestrator] Workspace runtime refresh note: ${refresh.reason}`);
    }
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
