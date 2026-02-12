import { ipcMain, shell } from 'electron';
import { IpcChannels } from '../../src/types/ipc';

export function registerShellHandlers(): void {
  ipcMain.handle(IpcChannels.shell.showItemInFolder, async (_event, fullPath: string) => {
    await shell.openPath(fullPath);
  });
}
