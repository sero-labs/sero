/**
 * Plugin system types — shared between Sero host, extensions, and federated
 * app modules. Keep renderer-safe (no Node imports).
 */

import type { ModelTier } from './model-selection';

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

export const SERO_HOST_CAPABILITIES = [
  'appAgent.invokeTool',
  'tool.cli',
  'appRuntime.background',
] as const;

export type SeroHostCapability = (typeof SERO_HOST_CAPABILITIES)[number];

export interface PluginCompatibilityIssue {
  kind: 'minSeroVersion' | 'requiredHostCapability';
  message: string;
  expected?: string;
  actual?: string;
  capability?: string;
}

export interface PluginCompatibilityStatus {
  supported: boolean;
  hostVersion: string;
  issues: PluginCompatibilityIssue[];
}

/** Plugin metadata from a package's `sero.plugin` field. */
export interface PluginMeta {
  category: PluginCategory;
  tags: string[];
  minSeroVersion?: string;
  requiredHostCapabilities?: string[];
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

/** A plugin discovered via GitHub topic / npm keyword search. */
export interface DiscoveredPlugin {
  /** npm package name (if on npm), otherwise GitHub repo full_name. */
  name: string;
  /** Human-readable display name. */
  displayName: string;
  /** Package description. */
  description: string;
  /** Author / owner name. */
  author: string;
  /** Latest version (from npm, if available). */
  version: string | null;
  /** GitHub repo URL. */
  githubUrl: string | null;
  /** npm package name (if published to npm). */
  npmPackage: string | null;
  /** GitHub star count. */
  stars: number;
  /** Install source string for installPlugin(). */
  installSource: string;
  /** Whether this plugin is already installed locally. */
  installed: boolean;
  /** Installed plugin ID, used for uninstall actions in discovery UI. */
  installedPluginId: string | null;
}

/** Provider auth metadata from a package's `sero.providers` field. */
export interface PluginProviderAuthManifest {
  type?: string;
  envVar?: string;
}

/** Provider metadata from a package's `sero.providers` field. */
export interface PluginProviderManifest {
  id?: string;
  name?: string;
  logo?: string;
  auth?: PluginProviderAuthManifest;
  defaults?: Partial<Record<ModelTier, string>>;
}

/** Normalized provider metadata surfaced by the host. */
export interface SeroProviderManifest {
  id: string;
  name?: string;
  logo?: string;
  auth?: {
    type: 'apiKey';
    envVar?: string;
  };
  defaults?: Partial<Record<ModelTier, string>>;
}
