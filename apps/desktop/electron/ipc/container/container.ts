/**
 * Container lifecycle IPC handlers.
 *
 * Exposes container status, inspect, and ensure to the renderer.
 * `ensure` is the primary entry point — called when a session is selected
 * so the container is ready for file browsing, terminals, and agent tools.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { containerManager, workspaceManager, buildContainerConfig } from '@electron/shared/infra/shared-infra';

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerContainerHandlers(): void {
  // Get container state for a workspace (returns null if no container)
  ipcMain.handle(
    IpcChannels.container.status,
    async (_event, workspaceId: string) => {
      try {
        const runtime = await workspaceManager.getRuntimeConfig(workspaceId);
        if (runtime.backend === 'host') return null;
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
      const runtime = await workspaceManager.getRuntimeConfig(workspaceId);
      if (runtime.backend === 'host') {
        throw new Error(`Container inspect is not applicable for host runtime (backend: ${runtime.backend})`);
      }

      try {
        return await containerManager.inspect(workspaceId);
      } catch (error) {
        throw new Error(
          `Container inspect failed for runtime backend ${runtime.backend}: ${toErrorMessage(error, 'unknown error')}`,
        );
      }
    },
  );

  // Ensure a workspace container is running — creates if needed.
  // Called by the renderer when a session is selected so the container
  // is immediately available for file trees, terminals, and tools.
  ipcMain.handle(
    IpcChannels.container.ensure,
    async (_event, workspaceId: string) => {
      const runtime = await workspaceManager.getRuntimeConfig(workspaceId);
      if (runtime.backend === 'host') return null;

      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);

      const config = await buildContainerConfig(workspaceId, wsPath);
      const state = await containerManager.ensure(config);
      return state;
    },
  );
}
