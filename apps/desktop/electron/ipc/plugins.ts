/**
 * Plugin IPC handlers — install, uninstall, list plugins.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { SeroAppManifest, InstalledPlugin } from '../../src/types/ipc';
import {
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  isInstalledPlugin,
} from '../plugins/manager';

export function registerPluginHandlers(): void {
  ipcMain.handle(
    IpcChannels.plugins.install,
    async (_event, source: string): Promise<SeroAppManifest> => {
      return installPlugin(source);
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.uninstall,
    async (_event, pluginId: string): Promise<void> => {
      return uninstallPlugin(pluginId);
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.list,
    async (): Promise<InstalledPlugin[]> => {
      return listInstalledPlugins();
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.isPlugin,
    async (_event, pluginId: string): Promise<boolean> => {
      return isInstalledPlugin(pluginId);
    },
  );
}
