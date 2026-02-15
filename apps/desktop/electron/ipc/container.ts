/**
 * Container lifecycle IPC handlers.
 *
 * Exposes container status + inspect to the renderer.
 * Container creation is lazy — triggered by agent.open, not directly by the UI.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import { containerManager } from './shared-infra';

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
}
