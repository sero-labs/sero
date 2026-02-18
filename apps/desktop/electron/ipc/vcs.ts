import { BrowserWindow, ipcMain } from 'electron';

import { vcsManager } from './shared-infra';

const VcsChannels = {
  list: 'sero:vcs:list-checkpoints',
  state: 'sero:vcs:state',
  create: 'sero:vcs:create-checkpoint',
  restore: 'sero:vcs:restore',
  diff: 'sero:vcs:diff',
  watch: 'sero:vcs:watch',
  unwatch: 'sero:vcs:unwatch',
  event: 'sero:vcs:event',
} as const;

function broadcast(event: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(VcsChannels.event, event);
  }
}

let subscribed = false;

export function registerVcsHandlers(): void {
  if (!subscribed) {
    subscribed = true;
    vcsManager.on('event', (event) => {
      broadcast(event);
    });
  }

  ipcMain.handle(VcsChannels.list, async (_event, workspaceId: string, limit?: number) => {
    return vcsManager.listCheckpoints(workspaceId, limit ?? 40);
  });

  ipcMain.handle(VcsChannels.state, async (_event, workspaceId: string, limit?: number) => {
    return vcsManager.getWorkspaceState(workspaceId, limit ?? 40);
  });

  ipcMain.handle(
    VcsChannels.create,
    async (_event, workspaceId: string, description?: string, source?: 'manual' | 'turn' | 'fs' | 'restore') => {
      return vcsManager.createCheckpoint(workspaceId, {
        source: source ?? 'manual',
        description,
      });
    },
  );

  ipcMain.handle(VcsChannels.restore, async (_event, workspaceId: string, checkpointId: string) => {
    await vcsManager.restoreCheckpoint(workspaceId, checkpointId);
  });

  ipcMain.handle(
    VcsChannels.diff,
    async (_event, workspaceId: string, fromChangeId: string, toChangeId?: string) => {
      return vcsManager.diff(workspaceId, fromChangeId, toChangeId);
    },
  );

  ipcMain.handle(VcsChannels.watch, async (_event, workspaceId: string) => {
    vcsManager.watchWorkspace(workspaceId);
  });

  ipcMain.handle(VcsChannels.unwatch, async (_event, workspaceId: string) => {
    vcsManager.unwatchWorkspace(workspaceId);
  });
}

export { VcsChannels };
