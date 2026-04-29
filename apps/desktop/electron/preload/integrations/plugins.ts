/**
 * Preload bridge for plugin management IPC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  SeroAppManifest,
  InstalledPlugin,
  PluginChangeEvent,
  PluginDevSessionIPC,
  DiscoveredPlugin,
} from '@/types/ipc';

export const pluginsBridge = {
  install: (source: string): Promise<SeroAppManifest> =>
    ipcRenderer.invoke(IpcChannels.plugins.install, source),

  uninstall: (pluginId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.plugins.uninstall, pluginId),

  list: (): Promise<InstalledPlugin[]> =>
    ipcRenderer.invoke(IpcChannels.plugins.list),

  listDevSessions: (): Promise<PluginDevSessionIPC[]> =>
    ipcRenderer.invoke(IpcChannels.plugins.listDevSessions),

  startDevSession: (sourcePath?: string): Promise<PluginDevSessionIPC | null> =>
    ipcRenderer.invoke(IpcChannels.plugins.startDevSession, sourcePath),

  refreshDevSession: (sessionId: string): Promise<PluginDevSessionIPC> =>
    ipcRenderer.invoke(IpcChannels.plugins.refreshDevSession, sessionId),

  stopDevSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.plugins.stopDevSession, sessionId),

  isPlugin: (pluginId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.plugins.isPlugin, pluginId),

  search: (query: string): Promise<DiscoveredPlugin[]> =>
    ipcRenderer.invoke(IpcChannels.plugins.search, query),

  onChanged: (callback: (event: PluginChangeEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PluginChangeEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.plugins.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.plugins.event, handler);
    };
  },
};
