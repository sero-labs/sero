/**
 * Workspace IPC handlers.
 *
 * Bridges renderer ↔ WorkspaceManager in the main process.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';

import { IpcChannels } from '../../src/types/ipc';
import type { WorkspaceInfo, WorkspaceConfig } from '../../src/types/ipc';
import { workspaceManager } from '../workspace';
import { containerManager, buildContainerConfig } from './shared-infra';

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

  // ── Open workspace (show in sidebar, persisted) ─────────────
  ipcMain.handle(
    IpcChannels.workspace.open,
    async (_event, id: string): Promise<void> => {
      return workspaceManager.open(id);
    },
  );

  // ── Close workspace (hide from sidebar, persisted) ─────────
  ipcMain.handle(
    IpcChannels.workspace.close,
    async (_event, id: string): Promise<void> => {
      return workspaceManager.close(id);
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
      // Recreate the container without the removed mount
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
 * Recreate a workspace's container if it's currently running so that
 * mount changes (added/removed references) take effect dynamically.
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

  try {
    await containerManager.remove(workspaceId);
    const config = await buildContainerConfig(workspaceId, wsPath);
    await containerManager.ensure(config);
    console.log(`[workspace] Recreated container for ${workspaceId} with updated references`);
  } catch (err) {
    console.error(`[workspace] Failed to recreate container for ${workspaceId}:`, err);
  }
}
