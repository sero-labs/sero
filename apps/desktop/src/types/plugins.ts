import type { SeroAppManifest } from './ipc';

export type { InstalledPlugin, PluginCategory, PluginMeta } from '../../electron/plugins/types';

/** Events pushed from main → renderer when plugin installation state changes. */
export type PluginChangeEvent =
  | { type: 'installed'; manifest: SeroAppManifest }
  | { type: 'uninstalled'; pluginId: string };
