/**
 * Plugin IPC handlers — install, uninstall, list plugins.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { SeroAppManifest, InstalledPlugin, PluginChangeEvent } from '../../../src/types/ipc';
import {
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  isInstalledPlugin,
} from '../../plugins/manager';
import { reloadAllSessionResources } from '../agent/agent';
import { disposeAppSessionsForApp } from '../workspace/app-agent';

function broadcastPluginEvent(event: PluginChangeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.plugins.event, event);
  }
}

export function registerPluginHandlers(): void {
  ipcMain.handle(
    IpcChannels.plugins.install,
    async (_event, source: string): Promise<SeroAppManifest> => {
      const manifest = await installPlugin(source);
      disposeAppSessionsForApp(manifest.id);
      broadcastPluginEvent({ type: 'installed', manifest });
      reloadAllSessionResources().catch((err) => {
        console.warn('[plugins] Failed to reload active chat session resources after install:', err);
      });
      return manifest;
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.uninstall,
    async (_event, pluginId: string): Promise<void> => {
      await uninstallPlugin(pluginId);
      disposeAppSessionsForApp(pluginId);
      broadcastPluginEvent({ type: 'uninstalled', pluginId });
      reloadAllSessionResources().catch((err) => {
        console.warn('[plugins] Failed to reload active chat session resources after uninstall:', err);
      });
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
