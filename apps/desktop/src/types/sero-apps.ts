import type { PluginMeta } from '@sero/common';

/**
 * Shape of entries in the `packages` array in settings.json.
 * Can be a plain path string or an object with a `source` field.
 */
export type SettingsPackageSource = string | { source?: string };

/** Widget definition from sero.app.widgets in package.json. */
export interface SeroWidgetManifest {
  /** Unique widget identifier within the app (e.g. "board-summary"). */
  id: string;
  /** Display name. */
  name: string;
  /** Exported component name from the module federation remote. */
  component: string;
  /** Default grid size (react-grid-layout units). */
  defaultSize: { w: number; h: number };
  /** Minimum grid size. */
  minSize?: { w: number; h: number };
  /** Maximum grid size. */
  maxSize?: { w: number; h: number };
  /** Optional description for the widget picker. */
  description?: string;
}

/** Manifest for a Sero app discovered from a Pi package. */
export interface SeroAppManifest {
  /** Unique app identifier (e.g. "todo"). */
  id: string;
  /** Display name. */
  name: string;
  /** Package description from package.json. */
  description: string | null;
  /** Package version from package.json. */
  version: string | null;
  /** npm package name from package.json. */
  packageName: string | null;
  /** Lucide icon name (e.g. "check-square"). */
  icon: string;
  /** State file path relative to workspace root (workspace-scoped apps). */
  stateFile: string;
  /**
   * Whether the app's state is per-workspace or shared globally.
   * - `"workspace"` (default): state at `<workspacePath>/<stateFile>`
   * - `"global"`: state at `~/.sero-ui/apps/<appId>/state.json`
   */
  scope: 'global' | 'workspace';
  /**
   * Absolute path to the global state file. Only set when `scope === "global"`.
   * Computed by app-discovery from `SERO_HOME/apps/<appId>/state.json`.
   */
  globalStatePath: string | null;
  /** Path to the module federation remoteEntry.js. Null if no UI. */
  uiEntry: string | null;
  /** Exported component name from the remote (e.g. "TodoApp"). */
  component: string | null;
  /** Dev server port for module federation (from sero.app.devPort). */
  devPort: number | undefined;
  /** Absolute path to the package root on disk. */
  packagePath: string;
  /** Whether this app comes from an installed plugin (vs core monorepo package). */
  isPlugin: boolean;
  /** Plugin manifest metadata from `sero.plugin` in package.json. */
  plugin?: PluginMeta | null;
  /** Widget definitions declared in the app manifest. */
  widgets: SeroWidgetManifest[];
}
