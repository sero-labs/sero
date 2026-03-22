/**
 * Preload bridge for plugin management IPC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { SeroAppManifest, InstalledPlugin } from '../../src/types/ipc';

export const pluginsBridge = {
  install: (source: string): Promise<SeroAppManifest> =>
    ipcRenderer.invoke(IpcChannels.plugins.install, source),

  uninstall: (pluginId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.plugins.uninstall, pluginId),

  list: (): Promise<InstalledPlugin[]> =>
    ipcRenderer.invoke(IpcChannels.plugins.list),

  isPlugin: (pluginId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.plugins.isPlugin, pluginId),
};
