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
  /**
   * `host.media.prepareImage` is available to background runtimes. Declare this
   * only if your runtime cannot work without it — a runtime that can fall back
   * to sending the original image should check for the method instead, so it
   * stays installable on older hosts.
   */
  'appRuntime.media',
  /** Federated UI can capture a visible region inside its active app panel. */
  'appControl.capture',
  /** Host mounts `sero.app.explorerView` as an Explorer view. */
  'ui.explorerView',
  /** Host mounts `sero.app.titlebar` as a title-bar control. */
  'ui.titlebar',
  /** Host mounts compatible model-extension shortcuts in the ChatPanel. */
  'ui.chat.model-extension',
  /** Host mounts contributed provider-neutral settings in Admin's Model section. */
  'ui.admin.model-settings',
  /** Federated UI can persist an image as the host dashboard background. */
  'ui.dashboardBackground',
  /**
   * Host-managed persistent Pi sessions for a background runtime (AD-029).
   *
   * Declaring this here does NOT authorise anyone — this list is a
   * COMPATIBILITY manifest that tells a plugin whether the host build supports
   * a capability. Authorisation is a separate host check: the app's resolved
   * package path must equal its canonical bundled-plugin path, and its app id
   * must be on the host's built-in allowlist.
   */
  'appRuntime.persistentSessions',
  /**
   * User-skill read/write for a background runtime (spec 18 — skill
   * extraction). Gated exactly like `appRuntime.persistentSessions`: this list
   * declares host support, and the host installs `host.skills` only for a
   * bundled plugin that passes the built-in gate.
   */
  'appRuntime.skills',
  /**
   * `host.workspace.create` for a background runtime and `window.sero.workspace.create`
   * for a federated UI. Not gated: any plugin may declare it. A runtime that
   * calls `create` without declaring it is refused by name, so the declaration
   * is what tells the host (and the catalog) that the plugin cannot work
   * without creating workspaces.
   */
  'appRuntime.workspaceCreate',
] as const;

/**
 * Federated-UI ABI the host can mount.
 *
 * Module Federation's share protocol is a private contract between the host and
 * a plugin's built bundle, so a plugin built against a different MF line cannot
 * share React with this host — it resolves a null React and crashes on its first
 * hook. Bump this whenever the MF version moves in a way that changes the
 * generated remoteEntry, and republish every plugin.
 *
 * - 1 — @module-federation/vite 1.11.x (runtime negotiation)
 * - 2 — @module-federation/vite 1.19.x (`__mf_module_cache__` share cache)
 * - 3 — etag app-state protocol (#428): `watch` returns `{ data, etag }`,
 *   change events carry an etag, and `useAppState` echoes it on write. A
 *   bundle built on ABI 2 blind-writes whole state files from stale renderer
 *   snapshots, which the host now rejects.
 */
export const SERO_PLUGIN_RUNTIME_ABI = 3;

export type SeroHostCapability = (typeof SERO_HOST_CAPABILITIES)[number];

export interface PluginCompatibilityIssue {
  kind: 'minSeroVersion' | 'requiredHostCapability' | 'pluginRuntimeAbi';
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
  /**
   * Federated-UI ABI this plugin's bundle was built against. Must equal
   * `SERO_PLUGIN_RUNTIME_ABI`; a plugin that omits it predates the ABI and
   * cannot be mounted.
   */
  runtimeAbi?: number;
  /** true for pre-built npm bundles; false/undefined for source repos built on install */
  preBuilt?: boolean;
  /** build-time hint for release packaging to ship bundled JS extension entries */
  bundleExtensions?: boolean;
  /** packages to keep external when bundling Pi extension entries */
  extensionExternals?: string[];
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

export type PluginChangeEventReason =
  | 'plugin-installed'
  | 'plugin-uninstalled'
  | 'dev-session-started'
  | 'dev-session-refreshed'
  | 'dev-session-ui-changed'
  | 'dev-session-stopped';

/** Renderer-safe plugin lifecycle event payload surfaced over the host bridge. */
export type PluginChangeEventIPC =
  | {
      type: 'installed';
      pluginId?: string;
      reason?: 'plugin-installed';
    }
  | {
      type: 'uninstalled';
      pluginId: string;
      reason?: 'plugin-uninstalled';
    }
  | {
      type: 'changed';
      pluginId: string | null;
      reason: 'dev-session-started' | 'dev-session-refreshed' | 'dev-session-ui-changed' | 'dev-session-stopped';
    };

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
