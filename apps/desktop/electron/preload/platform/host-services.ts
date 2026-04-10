import { ipcRenderer } from 'electron';

import { IpcChannels } from '@/types/ipc';
import type {
  ProxyFetchRequest,
  ProxyFetchResponse,
  QrLoginData,
  ResponseFeedbackEntry,
  ResponseFeedbackState,
} from '@/types/ipc';
import type { ThemePreset, ThemePresetMeta } from '@/types/theme';

export const pluginConfigBridge = {
  read: (pluginId: string): Promise<Record<string, unknown> | null> =>
    ipcRenderer.invoke(IpcChannels.pluginConfig.read, pluginId),
  write: (pluginId: string, config: Record<string, unknown>): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IpcChannels.pluginConfig.write, pluginId, config),
};

export const layoutBridge = {
  save: (state: { mainSidebarOpen: boolean; chatPanelOpen: boolean; favouriteApps: string[] }): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.layout.save, state),
  load: (): Promise<{ mainSidebarOpen: boolean; chatPanelOpen: boolean; favouriteApps?: string[] } | null> =>
    ipcRenderer.invoke(IpcChannels.layout.load),
};

export const themesBridge = {
  list: (): Promise<ThemePresetMeta[]> =>
    ipcRenderer.invoke(IpcChannels.themes.list),
  load: (id: string): Promise<ThemePreset | null> =>
    ipcRenderer.invoke(IpcChannels.themes.load, id),
  save: (preset: ThemePreset): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.themes.save, preset),
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.themes.delete, id),
  import: (): Promise<ThemePreset | null> =>
    ipcRenderer.invoke(IpcChannels.themes.import),
  export: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.themes.export, id),
  reset: (id: string): Promise<ThemePreset | null> =>
    ipcRenderer.invoke(IpcChannels.themes.reset, id),
};

export const netBridge = {
  fetch: (request: ProxyFetchRequest): Promise<ProxyFetchResponse> =>
    ipcRenderer.invoke(IpcChannels.net.fetch, request),
};

export const safeStorageBridge = {
  encrypt: (plaintext: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.safeStorage.encrypt, plaintext),
  decrypt: (encryptedBase64: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.safeStorage.decrypt, encryptedBase64),
  available: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.safeStorage.available),
};

export const gatewayBridge = {
  getQrLoginData: (expiryDays?: number): Promise<QrLoginData> =>
    ipcRenderer.invoke(IpcChannels.gateway.getQrLoginData, expiryDays),
};

export const feedbackBridge = {
  load: (): Promise<ResponseFeedbackState> =>
    ipcRenderer.invoke(IpcChannels.feedback.load),
  submit: (entry: ResponseFeedbackEntry): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.feedback.submit, entry),
  remove: (messageId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.feedback.remove, messageId),
};
