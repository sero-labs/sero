/**
 * Plugin Manager — install, uninstall, update, and list Sero plugins.
 *
 * Plugins are installed into ~/.sero-ui/agent/plugins/<plugin-id>/
 * and discovered at startup by app-discovery.ts (which already scans
 * that directory). This module handles the lifecycle operations.
 */

import { promises as fs } from 'fs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import { discoverApps, registerAppPath, unregisterAppPath } from '../apps/discovery';
import { registerExtAssets, unregisterExtAssets } from '@electron/platform/protocols/ext-protocol';
import { invalidatePackageProviderManifestCache } from '@electron/shared/providers/package-provider-manifests';
import { clearAppManifestCache } from '@electron/ipc/agent/handlers/app-agent';
import { clearPluginBridgePolicyCache } from '@electron/cli';
import type { SeroAppManifest } from '@/types/ipc';
import type { InstalledPlugin } from './types';
import {
  extractPluginCompatibilityRequirements,
  parsePluginMeta,
} from '../apps/discovery/plugin-meta';
import { reconcileInstalledPluginActivation } from './activation';
import { assertPluginCompatible } from './compatibility';
import { clearPackageCompatibilityCache } from './resource-compatibility';
import { assertPluginInstallAllowed } from './install-policy';
import { ensurePluginPackageReadyForInstall } from './package-build';
import { assertValidPluginId, resolvePluginInstallDir } from './security';
import {
  addPackageToSettings,
  removePackageFromSettings,
} from './settings';
const execFile = promisify(execFileCb);

export { reconcileInstalledPluginActivation } from './activation';

/** Directory where plugins are installed. */
const PLUGINS_DIR = path.join(SERO_AGENT_DIR, 'plugins');
/** Temporary staging area for installs / backups. Not scanned by app discovery. */
const PLUGIN_STAGING_DIR = path.join(SERO_AGENT_DIR, '.plugin-staging');
/** Sidecar filename persisted alongside installed plugins. */
const PLUGIN_META_FILENAME = '.sero-plugin-meta.json';
// ── Install serialisation ───────────────────────────────────
// Serialise all installs to prevent races when two installs target the same
// plugin ID. Each call chains onto the previous one.
let installLock: Promise<void> = Promise.resolve();
// ── Types ───────────────────────────────────────────────────
interface PkgJson {
  name?: string;
  description?: string;
  version?: string;
  sero?: {
    app?: {
      id?: string;
      name?: string;
      icon?: string;
      ui?: string;
      component?: string;
    };
    plugin?: unknown;
  };
}

interface ValidatedPluginApp {
  id: string;
  name: string;
  icon?: string;
  ui?: string;
  component?: string;
}

interface ValidatedPluginPackage {
  pkg: PkgJson;
  app: ValidatedPluginApp;
}

interface StagedPluginInstall {
  pluginId: string;
  stageDir: string;
  tempRoot: string;
}

interface ReservedInstallPath {
  installPath: string;
  backupRoot: string | null;
  backupDir: string | null;
}

/** Persisted alongside each installed plugin to preserve install provenance. */
interface PluginInstallMeta {
  /** Original source string passed to installPlugin(). */
  installedFrom: string;
  /** ISO 8601 timestamp. */
  installedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────

function readPkgJsonSync(dir: string): PkgJson | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PkgJson;
  } catch {
    return null;
  }
}

function readPluginMeta(pluginDir: string): PluginInstallMeta | null {
  try {
    const raw = readFileSync(path.join(pluginDir, PLUGIN_META_FILENAME), 'utf8');
    return JSON.parse(raw) as PluginInstallMeta;
  } catch {
    return null;
  }
}

function writePluginMeta(pluginDir: string, meta: PluginInstallMeta): void {
  writeFileSync(
    path.join(pluginDir, PLUGIN_META_FILENAME),
    JSON.stringify(meta, null, 2) + '\n',
  );
}

function validatePluginPackage(pkg: PkgJson | null): ValidatedPluginPackage {
  const app = pkg?.sero?.app;
  if (!app?.id || !app.name) {
    throw new Error(
      'Invalid plugin: missing required sero.app.id or sero.app.name in package.json',
    );
  }

  return {
    pkg: pkg!,
    app: {
      id: assertValidPluginId(app.id),
      name: app.name,
      icon: app.icon,
      ui: app.ui,
      component: app.component,
    },
  };
}

function assertPreparedUiExists(packageDir: string, app: ValidatedPluginApp): void {
  if (!app.ui) return;
  const distUi = path.join(packageDir, 'dist', 'ui', 'remoteEntry.js');
  if (!existsSync(distUi)) {
    throw new Error('Invalid plugin: declares UI but dist/ui/remoteEntry.js is missing.');
  }
}

function manifestToInstalledPlugin(
  pkg: PkgJson,
  packagePath: string,
  meta: PluginInstallMeta | null,
): InstalledPlugin {
  const app = pkg.sero?.app;
  const plugin = parsePluginMeta(pkg.sero?.plugin).meta;
  return {
    id: app?.id ?? path.basename(packagePath),
    name: app?.name ?? pkg.name ?? path.basename(packagePath),
    description: pkg.description ?? null,
    version: pkg.version ?? null,
    icon: app?.icon ?? 'box',
    category: plugin?.category ?? 'utilities',
    tags: plugin?.tags ?? [],
    source: meta?.installedFrom ?? packagePath,
    installedAt: meta?.installedAt ?? null,
    packagePath,
    hasUI: Boolean(app?.ui && app?.component),
  };
}

async function createTempRoot(prefix: string): Promise<string> {
  mkdirSync(PLUGIN_STAGING_DIR, { recursive: true });
  return fs.mkdtemp(path.join(PLUGIN_STAGING_DIR, `${prefix}-`));
}

async function cleanupDir(dirPath: string | null): Promise<void> {
  if (!dirPath) return;
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<string> {
  const result = (await execFile(command, args, { cwd, encoding: 'utf8' })) as {
    stdout: string;
    stderr: string;
  };
  return result.stdout;
}

async function reserveInstallPath(pluginId: string): Promise<ReservedInstallPath> {
  const installPath = resolvePluginInstallDir(PLUGINS_DIR, pluginId);

  if (!existsSync(installPath)) {
    return { installPath, backupRoot: null, backupDir: null };
  }

  const backupRoot = await createTempRoot(`${pluginId}-backup`);
  const backupDir = path.join(backupRoot, 'package');
  await fs.rename(installPath, backupDir);

  return { installPath, backupRoot, backupDir };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Install a plugin from a source. Serialised — only one install runs
 * at a time to prevent races on backup/restore for the same plugin ID.
 *
 * Supported source formats:
 * - Local path: `/absolute/path/to/package`
 * - npm package: `npm:@sero/plugin-todo@latest`
 * - Git URL: `git:https://github.com/user/repo.git`
 *
 * Returns the installed app manifest for immediate registration.
 */
export function installPlugin(source: string): Promise<SeroAppManifest> {
  const previousLock = installLock;
  let releaseLock!: () => void;
  installLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  return previousLock.then(async () => {
    try {
      return await doInstallPlugin(source);
    } finally {
      releaseLock();
    }
  });
}

async function doInstallPlugin(source: string): Promise<SeroAppManifest> {
  mkdirSync(PLUGINS_DIR, { recursive: true });

  let staged: StagedPluginInstall | null = null;
  let reserved: ReservedInstallPath | null = null;
  let settingsAdded = false;
  try {
    let sourceKind: 'npm' | 'git' | 'local' = 'local';

    if (source.startsWith('npm:')) {
      sourceKind = 'npm';
      staged = await installFromNpm(source.slice(4));
    } else if (source.startsWith('git:')) {
      sourceKind = 'git';
      staged = await installFromGit(source.slice(4));
    } else {
      staged = await installFromLocal(source);
    }

    await ensurePluginPackageReadyForInstall(staged.stageDir, sourceKind);

    const validated = validatePluginPackage(readPkgJsonSync(staged.stageDir));
    const compatibilityRequirements = extractPluginCompatibilityRequirements(
      validated.pkg.sero?.plugin,
    );
    assertPluginCompatible(compatibilityRequirements);
    assertPreparedUiExists(staged.stageDir, validated.app);
    const installPath = resolvePluginInstallDir(PLUGINS_DIR, validated.app.id);
    assertPluginInstallAllowed(await discoverApps(), validated.app.id, installPath);

    // Persist install provenance metadata before moving to final location.
    writePluginMeta(staged.stageDir, {
      installedFrom: source,
      installedAt: new Date().toISOString(),
    });

    reserved = await reserveInstallPath(validated.app.id);
    await fs.rename(staged.stageDir, installPath);

    settingsAdded = addPackageToSettings(installPath);
    await reconcileInstalledPluginActivation();
    registerAppPath(installPath);
    clearAppManifestCache();
    clearPluginBridgePolicyCache();
    clearPackageCompatibilityCache();

    const apps = await discoverApps();
    const manifest = apps.find(
      (app) => app.id === validated.app.id && app.packagePath === installPath,
    );

    if (!manifest) {
      throw new Error(`Plugin installed but failed to discover: ${validated.app.id}`);
    }

    registerExtAssets(manifest);
    invalidatePackageProviderManifestCache();
    return manifest;
  } catch (err) {
    if (reserved) {
      if (settingsAdded) {
        removePackageFromSettings(reserved.installPath);
      }
      unregisterAppPath(reserved.installPath);
      await cleanupDir(reserved.installPath);
      if (reserved.backupDir) {
        await fs.rename(reserved.backupDir, reserved.installPath).catch((restoreErr) => {
          console.error('[plugins] Failed to restore previous plugin install:', restoreErr);
        });
        invalidatePackageProviderManifestCache();
      }
    }
    throw err;
  } finally {
    clearAppManifestCache();
    clearPluginBridgePolicyCache();
    clearPackageCompatibilityCache();
    await cleanupDir(staged?.tempRoot ?? null);
    await cleanupDir(reserved?.backupRoot ?? null);
  }
}

/**
 * Uninstall a plugin by ID.
 *
 * Removes from disk and settings.json. Does NOT clean up app state
 * files — that's the user's choice.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
  const pluginPath = resolvePluginInstallDir(PLUGINS_DIR, pluginId);

  if (!existsSync(pluginPath)) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  await fs.rm(pluginPath, { recursive: true, force: true });
  unregisterExtAssets(pluginId);
  removePackageFromSettings(pluginPath);
  await reconcileInstalledPluginActivation();
  unregisterAppPath(pluginPath);
  clearAppManifestCache();
  clearPluginBridgePolicyCache();
  clearPackageCompatibilityCache();
}

/**
 * List all installed plugins (only from ~/.sero-ui/agent/plugins/).
 */
export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  const results: InstalledPlugin[] = [];

  try {
    const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = path.join(PLUGINS_DIR, entry.name);
      const pkg = readPkgJsonSync(pkgPath);
      if (pkg?.sero?.app) {
        const meta = readPluginMeta(pkgPath);
        results.push(manifestToInstalledPlugin(pkg, pkgPath, meta));
      }
    }
  } catch {
    // Directory doesn't exist yet — no plugins installed
  }

  return results;
}

/**
 * Check if a specific app ID is an installed plugin (vs a core package).
 */
export function isInstalledPlugin(pluginId: string): boolean {
  try {
    const pluginPath = resolvePluginInstallDir(PLUGINS_DIR, pluginId);
    return existsSync(path.join(pluginPath, 'package.json'));
  } catch {
    return false;
  }
}

// ── Install strategies ──────────────────────────────────────

async function installFromNpm(spec: string): Promise<StagedPluginInstall> {
  if (!spec.trim()) {
    throw new Error('Invalid npm plugin source: missing package specifier');
  }

  const tempRoot = await createTempRoot('npm-pack');

  try {
    const stdout = await runCommand(
      'npm',
      ['pack', '--json', '--pack-destination', '.', '--', spec],
      tempRoot,
    );

    const packResult = JSON.parse(stdout) as Array<{ filename?: string }>;
    const tarball = packResult.at(-1)?.filename;
    if (!tarball) {
      throw new Error(`npm pack did not produce a tarball for ${spec}`);
    }

    const tarPath = path.join(tempRoot, tarball);
    const extractDir = path.join(tempRoot, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    await runCommand('tar', ['-xzf', tarPath, '-C', extractDir], tempRoot);

    const stageDir = path.join(extractDir, 'package');
    const validated = validatePluginPackage(readPkgJsonSync(stageDir));

    return { pluginId: validated.app.id, stageDir, tempRoot };
  } catch (err) {
    await cleanupDir(tempRoot);
    throw err;
  }
}

async function installFromGit(url: string): Promise<StagedPluginInstall> {
  if (!url.trim()) {
    throw new Error('Invalid git plugin source: missing repository URL');
  }

  const tempRoot = await createTempRoot('git-clone');
  const stageDir = path.join(tempRoot, 'repo');

  try {
    await runCommand('git', ['clone', '--depth', '1', '--', url, stageDir], tempRoot);
    const validated = validatePluginPackage(readPkgJsonSync(stageDir));
    await fs.rm(path.join(stageDir, '.git'), { recursive: true, force: true });

    return { pluginId: validated.app.id, stageDir, tempRoot };
  } catch (err) {
    await cleanupDir(tempRoot);
    throw err;
  }
}

async function installFromLocal(source: string): Promise<StagedPluginInstall> {
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) {
    throw new Error(`Local path does not exist: ${resolved}`);
  }

  const validated = validatePluginPackage(readPkgJsonSync(resolved));
  const tempRoot = await createTempRoot(`${validated.app.id}-local`);
  const stageDir = path.join(tempRoot, 'package');

  try {
    await fs.cp(resolved, stageDir, { recursive: true });
    return { pluginId: validated.app.id, stageDir, tempRoot };
  } catch (err) {
    await cleanupDir(tempRoot);
    throw err;
  }
}

