/**
 * Preload bridge — local model management IPC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { LocalModelsConfig } from '../../../src/types/ipc';

export interface RemoteModelInfo {
  id: string;
  name?: string;
}

export const localModelsBridge = {
  getConfig: (): Promise<LocalModelsConfig> =>
    ipcRenderer.invoke(IpcChannels.localModels.getConfig),

  saveConfig: (config: LocalModelsConfig): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.localModels.saveConfig, config),

  testConnection: (baseUrl: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localModels.testConnection, baseUrl),

  fetchRemoteModels: (baseUrl: string): Promise<RemoteModelInfo[]> =>
    ipcRenderer.invoke(IpcChannels.localModels.fetchRemoteModels, baseUrl),
};
