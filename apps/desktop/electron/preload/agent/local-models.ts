/**
 * Preload bridge — local model management IPC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc';
import type {
  LocalModelsConfig,
  LocalModelsConnectionRequest,
  LocalRemoteModelInfo,
} from '@/types/ipc';

export const localModelsBridge = {
  getConfig: (): Promise<LocalModelsConfig> =>
    ipcRenderer.invoke(IpcChannels.localModels.getConfig),

  saveConfig: (config: LocalModelsConfig): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.localModels.saveConfig, config),

  testConnection: (request: LocalModelsConnectionRequest): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localModels.testConnection, request),

  fetchRemoteModels: (request: LocalModelsConnectionRequest): Promise<LocalRemoteModelInfo[]> =>
    ipcRenderer.invoke(IpcChannels.localModels.fetchRemoteModels, request),
};
