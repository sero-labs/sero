import type { PackageSource } from '@earendil-works/pi-coding-agent';
import type {
  AppContributionDiagnostic,
  AppContributions,
  PluginCompatibilityStatus,
  PluginMeta,
} from '@sero-ai/common';


/**
 * Canonical Pi package source shape from settings.json.
 * Supports plain sources plus filtered package objects.
 */
export type SettingsPackageSource = PackageSource;


/** Manifest for a Sero app discovered from a Pi package. */
export interface SeroAppManifest {
  /** Unique app identifier (e.g. "todo"). */
  id: string;
  /** Plugin stylesheet isolation contract. Missing means legacy global CSS. */
  styleIsolation?: 'scope' | null;
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
  /** Absolute path to the app runtime entry. Null if no background runtime. */
  runtimeEntry: string | null;
  /** Package names that the runtime loader should leave external when bundling TS runtimes. */
  runtimeExternals?: string[];
  /** Exported component name from the remote (e.g. "TodoApp"). */
  component: string | null;
  /** Dev server port for module federation (from sero.app.devPort). */
  devPort: number | undefined;
  /** Effective remote mf-manifest URL to prefer before legacy devPort fallback. */
  remoteEntryOverride: string | null;
  /** Absolute path to the package root on disk. */
  packagePath: string;
  /** Whether this app comes from an installed plugin (vs core monorepo package). */
  isPlugin: boolean;
  /** Plugin manifest metadata from `sero.plugin` in package.json. */
  plugin?: PluginMeta | null;
  /** Host/plugin compatibility status derived from the current Sero runtime. */
  hostCompatibility?: PluginCompatibilityStatus | null;
  /** Validated component and control contributions. */
  contributions: AppContributions;
  /** Non-fatal problems found while parsing contribution declarations. */
  contributionDiagnostics: AppContributionDiagnostic[];
}
