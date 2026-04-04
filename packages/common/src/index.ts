/**
 * @sero/common — shared types and utilities for Sero packages.
 *
 * Consumed by apps/desktop, federated app modules, and plugins.
 * Must remain renderer-safe (no Node imports).
 */

export type {
  InstalledPlugin,
  PluginCategory,
  PluginMeta,
  PluginRegistryEntry,
  DiscoveredPlugin,
} from './plugins';

export type {
  ExtensionRuntimeTextContent,
  ExtensionRuntimeImageContent,
  ExtensionRuntimeContentBlock,
  ExtensionRuntimeContent,
  ExtensionRuntimeMessage,
  ExtensionSessionRuntime,
} from './session-runtime';
