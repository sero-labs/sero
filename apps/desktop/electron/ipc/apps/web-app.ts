import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc';
import type { WebAppRequest } from '@sero/common';
import { webWorkspaceActionManager } from '@electron/features/apps/web-app/manager';

export function registerWebAppHandlers(): void {
  ipcMain.handle(
    IpcChannels.webApp.run,
    async (_event, workspaceId: string, params: WebAppRequest) => {
      return webWorkspaceActionManager.runWorkspaceAction(workspaceId, params);
    },
  );
}
