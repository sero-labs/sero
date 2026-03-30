/**
 * Plugin system types — re-exported from @sero/common.
 *
 * This file exists so that electron/ code can continue importing
 * from './types' without knowing about the common package.
 */

export type {
  InstalledPlugin,
  PluginCategory,
  PluginMeta,
  PluginRegistryEntry,
  DiscoveredPlugin,
} from '@sero/common';
