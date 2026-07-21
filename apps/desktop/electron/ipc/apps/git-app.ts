import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { GitManagerRequest } from '@sero-ai/common';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { registerGitServiceBridge } from '@electron/features/apps/git-app/service-bridge';

export function registerGitAppHandlers(): void {
  registerGitServiceBridge();
  ipcMain.handle(
    IpcChannels.gitApp.run,
    async (_event, workspaceId: string, params: GitManagerRequest) => {
      return gitWorkspaceStateManager.runWorkspaceAction(workspaceId, params);
    },
  );
}
