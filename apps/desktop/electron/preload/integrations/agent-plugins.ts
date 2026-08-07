import { ipcRenderer } from 'electron';
import type {
  AgentPluginChangeEvent,
  AgentPluginCliSettingsRequest,
  AgentPluginInspection,
  AgentPluginInstallRequest,
  AgentPluginRemoveRequest,
  AgentPluginUpdatePreview,
  AgentPluginUpdateRequest,
  InstalledAgentPlugin,
  SeroAgentPluginsBridge,
} from '@sero-ai/common';
import { IpcChannels } from '@/types/ipc-channels';

export const agentPluginsBridge: SeroAgentPluginsBridge = {
  list: (): Promise<InstalledAgentPlugin[]> => ipcRenderer.invoke(IpcChannels.agentPlugins.list),
  inspectSource: (source: string): Promise<AgentPluginInspection> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.inspectSource, source)
  ),
  install: (request: AgentPluginInstallRequest): Promise<InstalledAgentPlugin> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.install, request)
  ),
  previewUpdate: (id: string): Promise<AgentPluginUpdatePreview> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.previewUpdate, id)
  ),
  update: (request: AgentPluginUpdateRequest): Promise<InstalledAgentPlugin> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.update, request)
  ),
  setEnabled: (id: string, enabled: boolean): Promise<InstalledAgentPlugin> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.setEnabled, id, enabled)
  ),
  setCliExposure: (request: AgentPluginCliSettingsRequest): Promise<InstalledAgentPlugin> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.setCliExposure, request)
  ),
  approveComponents: (id: string): Promise<InstalledAgentPlugin> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.approveComponents, id)
  ),
  remove: (request: AgentPluginRemoveRequest): Promise<void> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.remove, request)
  ),
  reveal: (id: string, target: 'package' | 'data'): Promise<void> => (
    ipcRenderer.invoke(IpcChannels.agentPlugins.reveal, id, target)
  ),
  onChanged: (callback: (event: AgentPluginChangeEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, change: AgentPluginChangeEvent) => callback(change);
    ipcRenderer.on(IpcChannels.agentPlugins.event, handler);
    return () => ipcRenderer.removeListener(IpcChannels.agentPlugins.event, handler);
  },
};
