/**
 * File tree watcher IPC handlers.
 *
 * Manages filesystem watchers per workspace and pushes change events
 * to the renderer for live file tree updates.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { PRIMARY_ROOT_ID } from '@electron/features/workspace/roots';
import { workspaceManager } from '@electron/shared/infra/shared-infra';
import { fileWatcherManager } from '@electron/shared/infra/shared-infra';

export function registerFileTreeHandlers(): void {
  ipcMain.handle(
    IpcChannels.filetree.watch,
    async (_e, workspaceId: string) => {
      const hostDir = workspaceManager.getPath(workspaceId);
      if (!hostDir) {
        console.warn(`[filetree] Cannot watch — workspace not found: ${workspaceId}`);
        return;
      }

      const roots = await workspaceManager.getRoots(workspaceId);
      fileWatcherManager.watch(workspaceId, [
        { hostDir, virtualRoot: `/${PRIMARY_ROOT_ID}` },
        ...roots.map((root) => ({ hostDir: root.path, virtualRoot: `/${root.id}` })),
      ]);
    },
  );

  ipcMain.handle(
    IpcChannels.filetree.unwatch,
    async (_e, workspaceId: string) => {
      fileWatcherManager.unwatch(workspaceId);
    },
  );
}
