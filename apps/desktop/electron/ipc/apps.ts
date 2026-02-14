/**
 * Apps IPC handlers — discovery of Sero apps from Pi packages.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { SeroAppManifest } from '../../src/types/ipc';
import { discoverApps } from '../app-discovery';

export function registerAppsHandlers(): void {
  ipcMain.handle(
    IpcChannels.apps.discover,
    async (): Promise<SeroAppManifest[]> => {
      return discoverApps();
    },
  );
}
