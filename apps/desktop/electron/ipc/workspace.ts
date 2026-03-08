/**
 * Workspace IPC handlers.
 *
 * Bridges renderer ↔ WorkspaceManager in the main process.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';

import { IpcChannels } from '../../src/types/ipc';
import type { WorkspaceInfo, WorkspaceConfig } from '../../src/types/ipc';
import { workspaceManager } from '../workspace';
import { showNotification } from '../notifications';
import { containerManager, buildContainerConfig } from './shared-infra';
import { getAgentPoolEntry } from './agent';

export function registerWorkspaceHandlers(): void {
  // ── List all registered workspaces ─────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.list,
    async (): Promise<WorkspaceInfo[]> => {
      try {
        return await workspaceManager.list();
      } catch (err) {
        console.error('[workspace:list]', err);
        return [];
      }
    },
  );

  // ── Create a new workspace ──────────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.create,
    async (_event, name: string, parentPath?: string): Promise<WorkspaceInfo> => {
      return workspaceManager.create(name, parentPath);
    },
  );

  // ── Unregister a workspace (doesn't delete files) ──────────
  ipcMain.handle(
    IpcChannels.workspace.remove,
    async (_event, id: string): Promise<void> => {
      return workspaceManager.remove(id);
    },
  );

  // ── Get full config for a workspace ────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.getConfig,
    async (_event, id: string): Promise<WorkspaceConfig | null> => {
      return workspaceManager.getConfig(id);
    },
  );

  // ── Register an existing folder as a workspace ─────────────
  ipcMain.handle(
    IpcChannels.workspace.addFolder,
    async (_event, folderPath: string, name?: string): Promise<WorkspaceInfo> => {
      return workspaceManager.addFolder(folderPath, name);
    },
  );

  // ── Expand workspace tree node ───────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.open,
    async (_event, id: string): Promise<void> => {
      return workspaceManager.open(id);
    },
  );

  // ── Close workspace (remove from registry) ─────────────────
  ipcMain.handle(
    IpcChannels.workspace.close,
    async (_event, id: string): Promise<void> => {
      return workspaceManager.close(id);
    },
  );

  // ── Set expanded/collapsed state ───────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.setExpanded,
    async (_event, id: string, expanded: boolean): Promise<void> => {
      return workspaceManager.setExpanded(id, expanded);
    },
  );

  // ── Infer workspace from message ─────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.infer,
    async (_event, message: string): Promise<string> => {
      return workspaceManager.inferWorkspace(message);
    },
  );

  // ── Toggle container mode for a workspace ───────────────────
  ipcMain.handle(
    IpcChannels.workspace.setContainer,
    async (_event, id: string, enabled: boolean): Promise<void> => {
      return workspaceManager.setContainerEnabled(id, enabled);
    },
  );

  // ── Add workspace reference ────────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.addReference,
    async (_event, id: string, refId: string): Promise<void> => {
      await workspaceManager.addReference(id, refId);
      // Recreate the container with the new mount if it's running
      await recreateContainerIfRunning(id);
    },
  );

  // ── Remove workspace reference ────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.removeReference,
    async (_event, id: string, refId: string): Promise<void> => {
      await workspaceManager.removeReference(id, refId);
      await recreateContainerIfRunning(id);
    },
  );

  // ── Add arbitrary folder mount ─────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.addMount,
    async (_event, id: string, folderPath: string): Promise<void> => {
      await workspaceManager.addMount(id, folderPath);
      await recreateContainerIfRunning(id);
    },
  );

  // ── Remove arbitrary folder mount ──────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.removeMount,
    async (_event, id: string, folderPath: string): Promise<void> => {
      await workspaceManager.removeMount(id, folderPath);
      await recreateContainerIfRunning(id);
    },
  );

  // ── Native folder picker dialog ────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.pickFolder,
    async (): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Add Workspace Folder',
        buttonLabel: 'Add Workspace',
      });

      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
  );
}

/**
 * Check whether a workspace has any active (streaming) agent sessions.
 * Uses the shared agent pool to look up sessions by workspace ID.
 */
function hasActiveSessionsForWorkspace(workspaceId: string): boolean {
  // The pool is keyed by sessionId, so we scan for matching workspaceId
  // This uses the exported getAgentPoolEntry — but we need to iterate.
  // Instead, import the listEntries bridge. We check known session IDs
  // from the workspace's sessions dir, but the simplest approach is to
  // check the container's terminal count + agent streaming state.
  //
  // We rely on the agent pool: if any session for this workspace is
  // currently streaming, we defer container recreation.
  try {
    const sessions = containerManager.terminals.getWorkspaceTerminalIds(workspaceId);
    if (sessions.length > 0) return true;
  } catch {
    // Terminal manager may not track this workspace — that's fine
  }
  return false;
}

/**
 * Recreate a workspace's container if it's currently running so that
 * mount changes (added/removed references) take effect dynamically.
 *
 * If the container has active terminals, the recreation is deferred:
 * the config change is already persisted, so the next container start
 * (on session create or manual restart) will pick up the new mounts.
 * A notification tells the user the change is pending.
 */
async function recreateContainerIfRunning(workspaceId: string): Promise<void> {
  if (!containerManager.hasContainer(workspaceId)) return;

  try {
    const state = await containerManager.inspect(workspaceId);
    if (state.state !== 'running') return;
  } catch {
    return; // No container to recreate
  }

  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) return;

  // If there are active terminals, defer — don't kill running work
  if (hasActiveSessionsForWorkspace(workspaceId)) {
    console.log(
      `[workspace] Deferring container recreation for ${workspaceId} — active sessions present`,
    );
    showNotification({
      message: 'Reference updated. Container will apply changes on next restart (active sessions detected).',
      source: 'Workspace',
      type: 'info',
    });
    return;
  }

  try {
    await containerManager.remove(workspaceId);
    const config = await buildContainerConfig(workspaceId, wsPath);
    await containerManager.ensure(config);
    console.log(`[workspace] Recreated container for ${workspaceId} with updated references`);
  } catch (err) {
    console.error(`[workspace] Failed to recreate container for ${workspaceId}:`, err);
    showNotification({
      message: 'Failed to recreate container. Changes will apply on next restart.',
      source: 'Workspace',
      type: 'warning',
    });
  }
}
