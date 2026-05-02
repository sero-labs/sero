import type { SeroAppManifest } from './sero-apps';
import type { PluginChangeEventIPC } from '@sero-ai/common';

export type {
  InstalledPlugin,
  PluginCategory,
  PluginMeta,
  DiscoveredPlugin,
  PluginChangeEventIPC,
  PluginChangeEventReason,
} from '@sero-ai/common';
export type {
  PluginDevSessionStatus,
  PluginDevSessionUiMode,
  PluginDevSessionIPC,
} from './plugin-dev';

/** Events pushed from main → renderer when plugin or dev-session state changes. */
export type PluginChangeEvent =
  | (Extract<PluginChangeEventIPC, { type: 'installed' }> & { manifest: SeroAppManifest })
  | Extract<PluginChangeEventIPC, { type: 'uninstalled' }>
  | (Extract<PluginChangeEventIPC, { type: 'changed' }> & { manifest?: SeroAppManifest | null });
