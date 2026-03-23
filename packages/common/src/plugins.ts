/**
 * Plugin system types — shared between Sero host, extensions, and federated
 * app modules. Keep renderer-safe (no Node imports).
 */

/** Plugin category for browsing / filtering. */
export type PluginCategory =
  | 'productivity'
  | 'developer-tools'
  | 'entertainment'
  | 'integrations'
  | 'finance'
  | 'health'
  | 'creative'
  | 'utilities';

/** Plugin metadata from a package's `sero.plugin` field. */
export interface PluginMeta {
  category: PluginCategory;
  tags: string[];
  minSeroVersion?: string;
  /** true for pre-built npm bundles; false/undefined for source repos built on install */
  preBuilt?: boolean;
  /** true/undefined = bridge all tools, false = none, string[] = listed tools only */
  bridgeTools?: boolean | string[];
}

/** An installed plugin's info, surfaced to the renderer. */
export interface InstalledPlugin {
  /** App ID (from sero.app.id). */
  id: string;
  /** Display name. */
  name: string;
  /** Package description. */
  description: string | null;
  /** Package version. */
  version: string | null;
  /** Lucide icon name. */
  icon: string;
  /** Plugin category. */
  category: PluginCategory;
  /** Search tags. */
  tags: string[];
  /** Original install source (npm:, git:, or local path). */
  source: string;
  /** ISO timestamp of when the plugin was installed, or null if unknown. */
  installedAt: string | null;
  /** Absolute path on disk. */
  packagePath: string;
  /** Whether the plugin has a UI component. */
  hasUI: boolean;
}

/** Entry in the remote plugin registry (fetched from GitHub / static JSON). */
export interface PluginRegistryEntry {
  id: string;
  name: string;
  description: string;
  source: string;
  github?: string;
  category: PluginCategory;
  icon: string;
  author: string;
  verified?: boolean;
}
