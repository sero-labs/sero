/**
 * Plugin IPC handlers — install, uninstall, list plugins.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { SeroAppManifest, InstalledPlugin, PluginChangeEvent, DiscoveredPlugin } from '@/types/ipc';
import {
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  isInstalledPlugin,
} from '@electron/features/plugins/manager';
import { reconcileInstalledPluginActivation } from '@electron/features/plugins/activation';
import { searchPlugins } from '@electron/features/plugins/discovery';
import { reloadAllSessionResources } from '../agent';
import { disposeAppSessionsForApp } from '../agent/handlers/app-agent';
import { broadcastToWindows } from '../lib/window-broadcast';

function broadcastPluginEvent(event: PluginChangeEvent): void {
  broadcastToWindows(IpcChannels.plugins.event, event);
}

export function registerPluginHandlers(): void {
  reconcileInstalledPluginActivation().catch((err) => {
    console.warn('[plugins] Failed to reconcile installed plugin activation state:', err);
  });

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

  ipcMain.handle(
    IpcChannels.plugins.search,
    async (_event, query: string): Promise<DiscoveredPlugin[]> => {
      return searchPlugins(query ?? '');
    },
  );
}
