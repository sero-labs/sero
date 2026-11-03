import { clipboard, ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';

/**
 * The clipboard module is main-process only since Electron 44 and its write
 * methods are asynchronous, so renderer copies go through this handler instead
 * of the preload.
 */
export function registerClipboardHandlers(): void {
  ipcMain.handle(
    IpcChannels.clipboard.writeText,
    async (_event, text: string): Promise<boolean> => {
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
  );
}
