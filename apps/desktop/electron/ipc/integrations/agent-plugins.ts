import { shell, ipcMain } from 'electron';
import type {
  AgentPluginChangeEvent,
  AgentPluginCliSettingsRequest,
  AgentPluginInstallRequest,
  AgentPluginRemoveRequest,
  AgentPluginUpdateRequest,
} from '@sero-ai/common';
import { IpcChannels } from '@/types/ipc-channels';
import {
  approveAgentPluginComponents,
  inspectAgentPluginSource,
  installAgentPlugin,
  listInstalledAgentPlugins,
  previewAgentPluginUpdate,
  removeAgentPlugin,
  setAgentPluginCliExposure,
  setAgentPluginEnabled,
  updateAgentPlugin,
} from '@electron/features/agent-plugins/manager';
import { reloadAllSessionResources } from '../agent/core/agent';
import { broadcastToWindows } from '../lib/window-broadcast';
import { refreshAgentPluginCliCommands } from '@electron/cli';

async function broadcast(change: AgentPluginChangeEvent): Promise<void> {
  refreshAgentPluginCliCommands();
  broadcastToWindows(IpcChannels.agentPlugins.event, change);
  await reloadAllSessionResources().catch((error) => {
    console.warn('[agent-plugins] Failed to reload active session resources:', error);
  });
}

export function registerAgentPluginHandlers(): void {
  ipcMain.handle(IpcChannels.agentPlugins.list, () => listInstalledAgentPlugins());
  ipcMain.handle(IpcChannels.agentPlugins.inspectSource, (_event, source: string) => inspectAgentPluginSource(source));
  ipcMain.handle(IpcChannels.agentPlugins.install, async (_event, request: AgentPluginInstallRequest) => {
    const plugin = await installAgentPlugin(request);
    await broadcast({ type: 'installed', pluginId: plugin.id });
    return plugin;
  });
  ipcMain.handle(IpcChannels.agentPlugins.previewUpdate, (_event, id: string) => previewAgentPluginUpdate(id));
  ipcMain.handle(IpcChannels.agentPlugins.update, async (_event, request: AgentPluginUpdateRequest) => {
    const plugin = await updateAgentPlugin(request);
    await broadcast({ type: 'updated', pluginId: plugin.id });
    return plugin;
  });
  ipcMain.handle(IpcChannels.agentPlugins.setEnabled, async (_event, id: string, enabled: boolean) => {
    const plugin = await setAgentPluginEnabled(id, enabled);
    await broadcast({ type: 'changed', pluginId: id });
    return plugin;
  });
  ipcMain.handle(IpcChannels.agentPlugins.setCliExposure, async (_event, request: AgentPluginCliSettingsRequest) => {
    const plugin = await setAgentPluginCliExposure(request);
    await broadcast({ type: 'changed', pluginId: plugin.id });
    return plugin;
  });
  ipcMain.handle(IpcChannels.agentPlugins.approveComponents, async (_event, id: string) => {
    const plugin = await approveAgentPluginComponents(id);
    await broadcast({ type: 'changed', pluginId: id });
    return plugin;
  });
  ipcMain.handle(IpcChannels.agentPlugins.remove, async (_event, request: AgentPluginRemoveRequest) => {
    await removeAgentPlugin(request);
    await broadcast({ type: 'removed', pluginId: request.id });
  });
  ipcMain.handle(IpcChannels.agentPlugins.reveal, async (_event, id: string, target: 'package' | 'data') => {
    const plugin = (await listInstalledAgentPlugins()).find((candidate) => candidate.id === id);
    if (!plugin) throw new Error(`Agent Plugin not found: ${id}`);
    shell.showItemInFolder(target === 'package' ? plugin.packagePath : plugin.dataPath);
  });
}
