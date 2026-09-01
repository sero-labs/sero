import { ipcRenderer } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type {
  AppRuntimeCreateWorktreeCleanupPlanResult,
  AppRuntimeExecuteWorktreeCleanupPlanResult,
  AppRuntimeWorktreePoolStatusResult,
} from '@sero-ai/common';

export const worktreePoolBridge = {
  status: (workspaceId: string): Promise<AppRuntimeWorktreePoolStatusResult> =>
    ipcRenderer.invoke(IpcChannels.worktreePool.status, workspaceId),
  createCleanupPlan: (workspaceId: string): Promise<AppRuntimeCreateWorktreeCleanupPlanResult> =>
    ipcRenderer.invoke(IpcChannels.worktreePool.createCleanupPlan, workspaceId),
  executeCleanupPlan: (
    workspaceId: string,
    planId: string,
  ): Promise<AppRuntimeExecuteWorktreeCleanupPlanResult> =>
    ipcRenderer.invoke(IpcChannels.worktreePool.executeCleanupPlan, workspaceId, planId),
};
