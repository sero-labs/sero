import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { GitManagerRequest } from '@plugins/sero-git-plugin/shared/types';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';

export function registerGitAppHandlers(): void {
  ipcMain.handle(
    IpcChannels.gitApp.run,
    async (_event, workspaceId: string, params: GitManagerRequest) => {
      return gitWorkspaceStateManager.runWorkspaceAction(workspaceId, params);
    },
  );
}
