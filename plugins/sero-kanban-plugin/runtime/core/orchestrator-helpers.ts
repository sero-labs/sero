import type { KanbanRuntimeHost } from '../types';
import type { Column, KanbanState } from './types';
import { updateCard } from './state-helpers';
import { maintainWorkspaceForNewCard } from './worktree-maintenance';
import { collectPersistedCardFixes } from './persisted-state-reconcile';

export async function isYoloModeEnabled(
  host: Pick<KanbanRuntimeHost, 'appState'>,
  stateFilePath: string,
): Promise<boolean> {
  return ((await host.appState.read<KanbanState>(stateFilePath))?.settings?.yoloMode) === true;
}

export async function runWorkspaceMaintenance(
  host: Pick<KanbanRuntimeHost, 'git' | 'workspace' | 'appState'>,
  workspaceId: string,
  stateFilePath: string,
  workspacePath: string,
  state: KanbanState | null,
): Promise<void> {
  const maintenance = await maintainWorkspaceForNewCard(host, workspacePath, state);
  for (const cleanedCardId of maintenance.cleanedCardIds) {
    await updateCard(host.appState, stateFilePath, cleanedCardId, {
      worktreePath: undefined,
      branch: undefined,
    });
  }
  if (!maintenance.sync.synced && maintenance.sync.reason) {
    console.log(`[kanban-runtime] Workspace sync skipped: ${maintenance.sync.reason}`);
    return;
  }

  if (maintenance.sync.synced && maintenance.sync.headChanged) {
    const refresh = await host.workspace.refreshAfterSync(workspaceId, workspacePath);
    if (refresh.installCommand && refresh.dependenciesInstalled) {
      console.log(`[kanban-runtime] Workspace dependencies refreshed via "${refresh.installCommand}"`);
    }
    if (refresh.restartedServerIds.length > 0) {
      console.log(
        `[kanban-runtime] Restarted ${refresh.restartedServerIds.length} dev server(s) after workspace sync`,
      );
    }
    if (refresh.autoStartedServerId) {
      console.log(`[kanban-runtime] Auto-started dev server ${refresh.autoStartedServerId} after workspace sync`);
    }
    if (refresh.reason) {
      console.log(`[kanban-runtime] Workspace runtime refresh note: ${refresh.reason}`);
    }
  }
}

export async function reconcilePersistedState(
  host: Pick<KanbanRuntimeHost, 'git' | 'appState'>,
  stateFilePath: string,
  lastColumnMap: Map<string, Column>,
  state: KanbanState | null,
): Promise<void> {
  for (const fix of await collectPersistedCardFixes(host, state)) {
    if (fix.update.column) lastColumnMap.set(fix.id, fix.update.column);
    await updateCard(host.appState, stateFilePath, fix.id, fix.update);
  }
}
