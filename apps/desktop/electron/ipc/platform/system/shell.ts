import { ipcMain, shell } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';

export function registerShellHandlers(): void {
  ipcMain.handle(IpcChannels.shell.showItemInFolder, async (_event, fullPath: string) => {
    await shell.openPath(fullPath);
  });
  ipcMain.handle(IpcChannels.shell.openExternal, async (_event, url: string) => {
    await shell.openExternal(url);
  });
}
