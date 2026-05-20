import { ipcMain, shell } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { isAllowedExternalUrl } from '@electron/platform/security/window-security';

export function registerShellHandlers(): void {
  ipcMain.handle(IpcChannels.shell.showItemInFolder, async (_event, fullPath: string) => {
    await shell.openPath(fullPath);
  });
  ipcMain.handle(IpcChannels.shell.openExternal, async (_event, url: unknown) => {
    if (!isAllowedExternalUrl(url)) {
      throw new Error('Blocked external URL.');
    }

    await shell.openExternal(url);
  });
  ipcMain.handle(IpcChannels.shell.clearRendererCache, async (event) => {
    await event.sender.session.clearCache();
  });
}
