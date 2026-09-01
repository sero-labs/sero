import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import {
  createWorktreeCleanupPlan,
  executeWorktreeCleanupPlan,
  getWorktreePoolStatus,
} from '@electron/features/git/worktree/pool';
import { workspaceManager } from '@electron/features/workspace/manager';

function workspacePath(workspaceId: string): string {
  const resolved = workspaceManager.getPath(workspaceId);
  if (!resolved) throw new Error(`Workspace not found: ${workspaceId}`);
  return resolved;
}

export function registerWorktreePoolHandlers(): void {
  ipcMain.handle(IpcChannels.worktreePool.status, (_event, workspaceId: string) =>
    getWorktreePoolStatus(workspacePath(workspaceId)));
  ipcMain.handle(IpcChannels.worktreePool.createCleanupPlan, (_event, workspaceId: string) =>
    createWorktreeCleanupPlan(workspacePath(workspaceId)));
  ipcMain.handle(
    IpcChannels.worktreePool.executeCleanupPlan,
    (_event, workspaceId: string, planId: string) =>
      executeWorktreeCleanupPlan(workspacePath(workspaceId), planId),
  );
}
