/**
 * File tree watcher IPC handlers.
 *
 * Manages filesystem watchers per workspace and pushes change events
 * to the renderer for live file tree updates.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { workspaceWatchRoots } from '@electron/features/workspace/watch-roots';
import { RENDERER_OWNER } from '@electron/features/workspace/watcher';
import { fileWatcherManager } from '@electron/shared/infra/shared-infra';

export function registerFileTreeHandlers(): void {
  ipcMain.handle(
    IpcChannels.filetree.watch,
    async (_e, workspaceId: string) => {
      const roots = await workspaceWatchRoots(workspaceId);
      if (!roots) {
        console.warn(`[filetree] Cannot watch — workspace not found: ${workspaceId}`);
        return;
      }

      fileWatcherManager.watch(workspaceId, roots, RENDERER_OWNER);
    },
  );

  ipcMain.handle(
    IpcChannels.filetree.unwatch,
    async (_e, workspaceId: string) => {
      fileWatcherManager.unwatch(workspaceId, RENDERER_OWNER);
    },
  );
}
