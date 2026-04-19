import type { SeroAppManifest } from './sero-apps';

export type { InstalledPlugin, PluginCategory, PluginMeta, DiscoveredPlugin } from '@sero-ai/common';

/** Events pushed from main → renderer when plugin installation state changes. */
export type PluginChangeEvent =
  | { type: 'installed'; manifest: SeroAppManifest }
  | { type: 'uninstalled'; pluginId: string };
