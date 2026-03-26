/**
 * Container lifecycle IPC handlers.
 *
 * Exposes container status, inspect, and ensure to the renderer.
 * `ensure` is the primary entry point — called when a session is selected
 * so the container is ready for file browsing, terminals, and agent tools.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import { containerManager, workspaceManager, buildContainerConfig } from '../shared-infra';

export function registerContainerHandlers(): void {
  // Get container state for a workspace (returns null if no container)
  ipcMain.handle(
    IpcChannels.container.status,
    async (_event, workspaceId: string) => {
      try {
        if (!containerManager.hasContainer(workspaceId)) return null;
        const state = await containerManager.inspect(workspaceId);
        return state;
      } catch {
        return null;
      }
    },
  );

  // Detailed container inspection
  ipcMain.handle(
    IpcChannels.container.inspect,
    async (_event, workspaceId: string) => {
      try {
        return await containerManager.inspect(workspaceId);
      } catch (err: any) {
        throw new Error(`Container inspect failed: ${err.message}`);
      }
    },
  );

  // Ensure a workspace container is running — creates if needed.
  // Called by the renderer when a session is selected so the container
  // is immediately available for file trees, terminals, and tools.
  ipcMain.handle(
    IpcChannels.container.ensure,
    async (_event, workspaceId: string) => {
      const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);
      if (!containerEnabled) return null;

      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);

      const config = await buildContainerConfig(workspaceId, wsPath);
      const state = await containerManager.ensure(config);
      return state;
    },
  );
}
