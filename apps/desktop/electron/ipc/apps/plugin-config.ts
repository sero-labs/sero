/**
 * Plugin config IPC handlers.
 *
 * Generic config storage for any plugin — read/write JSON files
 * at ~/.sero-ui/agent/plugin-config/<pluginId>.json.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import { readPluginConfig, writePluginConfig } from '../../features/plugin-config';

export function registerPluginConfigHandlers(): void {
  ipcMain.handle(
    IpcChannels.pluginConfig.read,
    async (_event, pluginId: string): Promise<Record<string, unknown> | null> => {
      return readPluginConfig(pluginId);
    },
  );

  ipcMain.handle(
    IpcChannels.pluginConfig.write,
    async (_event, pluginId: string, config: Record<string, unknown>): Promise<{ ok: boolean }> => {
      try {
        writePluginConfig(pluginId, config);
        return { ok: true };
      } catch (err) {
        console.error(`[plugin-config] Failed to write config for ${pluginId}:`, err);
        return { ok: false };
      }
    },
  );
}
