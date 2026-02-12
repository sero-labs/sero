/**
 * Workspace IPC handlers.
 *
 * Bridges renderer ↔ WorkspaceManager in the main process.
 */

import { ipcMain } from 'electron';

import { IpcChannels } from '../../src/types/ipc';
import type { WorkspaceInfo, WorkspaceConfig } from '../../src/types/ipc';
import { workspaceManager } from '../workspace';

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

  // ── Create a new workspace under ~/.sero-ui/workspaces/ ────
  ipcMain.handle(
    IpcChannels.workspace.create,
    async (_event, name: string): Promise<WorkspaceInfo> => {
      return workspaceManager.create(name);
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

  // ── Set autoOpen flag ──────────────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.setAutoOpen,
    async (_event, id: string, autoOpen: boolean): Promise<void> => {
      return workspaceManager.setAutoOpen(id, autoOpen);
    },
  );
}
