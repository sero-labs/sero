import { ipcMain } from 'electron';

import { IpcChannels } from '../../src/types/ipc-channels';
import type { GitManagerRequest } from '../../../../packages/pi-git-extension/shared/types';
import { gitWorkspaceStateManager } from '../git-app/manager';

export function registerGitAppHandlers(): void {
  ipcMain.handle(
    IpcChannels.gitApp.run,
    async (_event, workspaceId: string, params: GitManagerRequest) => {
      return gitWorkspaceStateManager.runWorkspaceAction(workspaceId, params);
    },
  );
}
