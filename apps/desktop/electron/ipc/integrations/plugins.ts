/**
 * Plugin IPC handlers — install, uninstall, list plugins, and manage local
 * plugin development sessions.
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  SeroAppManifest,
  InstalledPlugin,
  DiscoveredPlugin,
  PluginDevSessionIPC,
} from '@/types/ipc';
import {
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  isInstalledPlugin,
} from '@electron/features/plugins/manager';
import { reconcileInstalledPluginActivation } from '@electron/features/plugins/activation';
import { searchPlugins } from '@electron/features/plugins/discovery';
import { toPluginDevSessionIPC } from '@electron/features/plugins/dev-sessions/types';
import { reloadAllSessionResources } from '../agent/core/agent';
import { disposeAppSessionsForApp } from '../agent/handlers/app-agent';
import {
  appRuntimeManager,
  pluginDevSessionManager,
} from '@electron/shared/infra/shared-infra';
import { broadcastPluginEvent } from './plugin-events';

async function pickPluginDevSourcePath(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const result = win
    ? await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Start Local Plugin Development',
        buttonLabel: 'Start Development',
      })
    : await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Start Local Plugin Development',
        buttonLabel: 'Start Development',
      });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
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
      await appRuntimeManager.reconcile();
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
      await appRuntimeManager.reconcile();
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
    IpcChannels.plugins.listDevSessions,
    async (): Promise<PluginDevSessionIPC[]> => {
      const sessions = await pluginDevSessionManager.list();
      return sessions.map(toPluginDevSessionIPC);
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.startDevSession,
    async (_event, sourcePath?: string): Promise<PluginDevSessionIPC | null> => {
      const nextSourcePath = sourcePath ?? await pickPluginDevSourcePath();
      if (!nextSourcePath) return null;

      const record = await pluginDevSessionManager.start(nextSourcePath);
      return toPluginDevSessionIPC(record);
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.refreshDevSession,
    async (_event, sessionId: string): Promise<PluginDevSessionIPC> => {
      const record = await pluginDevSessionManager.refresh(sessionId);
      return toPluginDevSessionIPC(record);
    },
  );

  ipcMain.handle(
    IpcChannels.plugins.stopDevSession,
    async (_event, sessionId: string): Promise<void> => {
      await pluginDevSessionManager.stop(sessionId);
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
