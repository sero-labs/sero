/**
 * IPC handlers for auto-update. Exposed on `window.sero.updater`.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { UpdaterStatusEvent } from '@/types/ipc';
import {
  checkForUpdates,
  getUpdaterStatus,
  restartToUpdate,
} from '@electron/features/updater/updater';

export function registerUpdaterHandlers(): void {
  ipcMain.handle(IpcChannels.updater.check, (): Promise<void> => checkForUpdates({ manual: true }));
  ipcMain.handle(IpcChannels.updater.getStatus, (): UpdaterStatusEvent => getUpdaterStatus());
  ipcMain.handle(IpcChannels.updater.restart, (): void => restartToUpdate());
}
