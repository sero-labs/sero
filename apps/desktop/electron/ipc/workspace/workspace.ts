/**
 * Workspace IPC handlers.
 *
 * Bridges renderer ↔ WorkspaceManager in the main process.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';

import { IpcChannels } from '@/types/ipc';
import type { WorkspaceInfo, WorkspaceConfig, WorkspaceRoot } from '@/types/ipc';
import { workspaceManager } from '@electron/features/workspace/manager';
import { assertIsSeroPluginFolder } from '@electron/features/workspace/plugin-validation';
import { recreateContainerIfRunning } from '@electron/features/workspace/container-sync';

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

  // ── Multi-root: list / add / remove / rename ───────────────
  ipcMain.handle(
    IpcChannels.workspace.listRoots,
    async (_event, id: string): Promise<WorkspaceRoot[]> => {
      return workspaceManager.getRoots(id);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.addRoot,
    async (
      _event,
      id: string,
      input: { name: string; path: string; kind?: WorkspaceRoot['kind'] },
    ): Promise<WorkspaceRoot> => {
      // Plugin-folder validation must run in the main process so the IPC
      // API itself rejects "linked-plugin" payloads pointing at folders
      // that are not actually Sero plugins.
      if (input.kind === 'linked-plugin') {
        await assertIsSeroPluginFolder(input.path);
      }
      const root = await workspaceManager.addRoot(id, input);
      // Container parity: roots are merged into bind-mounts at container
      // build time, so recreate the container to pick up the new mount.
      await recreateContainerIfRunning(id);
      return root;
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.removeRoot,
    async (_event, id: string, rootId: string): Promise<void> => {
      await workspaceManager.removeRoot(id, rootId);
      await recreateContainerIfRunning(id);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.renameRoot,
    async (_event, id: string, rootId: string, newName: string): Promise<void> => {
      await workspaceManager.renameRoot(id, rootId, newName);
      // Rename is metadata-only; no container recreation needed.
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

