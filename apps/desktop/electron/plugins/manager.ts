/**
 * Plugin Manager — install, uninstall, update, and list Sero plugins.
 *
 * Plugins are installed into ~/.sero-ui/agent/packages/<plugin-id>/
 * and discovered at startup by app-discovery.ts (which already scans
 * that directory). This module handles the lifecycle operations.
 */

import { promises as fs } from 'fs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { execSync, exec as execCb } from 'child_process';
import { promisify } from 'util';

import { SERO_AGENT_DIR } from '../env';
import { registerAppPath, discoverApps } from '../app-discovery';
import { registerExtAssets } from '../ext-protocol';
import type { SeroAppManifest, SettingsPackageSource } from '../../src/types/ipc';
import type { InstalledPlugin, PluginMeta, PluginCategory } from './types';

const exec = promisify(execCb);

/** Directory where plugins are installed. */
const PLUGINS_DIR = path.join(SERO_AGENT_DIR, 'packages');

/** Path to the settings.json file. */
const SETTINGS_PATH = path.join(SERO_AGENT_DIR, 'settings.json');

// ── Helpers ─────────────────────────────────────────────────

interface PkgJson {
  name?: string;
  description?: string;
  version?: string;
  sero?: {
    app?: {
      id: string;
      name: string;
      icon?: string;
      ui?: string;
      component?: string;
    };
    plugin?: PluginMeta;
  };
}

function readPkgJsonSync(dir: string): PkgJson | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

function getPackagesArray(settings: Record<string, unknown>): SettingsPackageSource[] {
  return Array.isArray(settings.packages) ? settings.packages as SettingsPackageSource[] : [];
}

function manifestToInstalledPlugin(
  pkg: PkgJson,
  packagePath: string,
  source: string,
): InstalledPlugin {
  const app = pkg.sero?.app;
  const plugin = pkg.sero?.plugin;
  return {
    id: app?.id ?? path.basename(packagePath),
    name: app?.name ?? pkg.name ?? path.basename(packagePath),
    description: pkg.description ?? null,
    version: pkg.version ?? null,
    icon: app?.icon ?? 'box',
    category: plugin?.category ?? 'utilities',
    tags: plugin?.tags ?? [],
    source,
    packagePath,
    hasUI: Boolean(app?.ui && app?.component),
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Install a plugin from a source.
 *
 * Supported source formats:
 * - Local path: `/absolute/path/to/package`
 * - npm package: `npm:@sero/plugin-todo@latest`
 * - Git URL: `git:https://github.com/user/repo.git`
 *
 * Returns the installed app manifest for immediate registration.
 */
export async function installPlugin(source: string): Promise<SeroAppManifest> {
  mkdirSync(PLUGINS_DIR, { recursive: true });

  let installPath: string;

  if (source.startsWith('npm:')) {
    installPath = await installFromNpm(source.slice(4));
  } else if (source.startsWith('git:')) {
    installPath = await installFromGit(source.slice(4));
  } else {
    // Local path — copy into plugins dir
    installPath = await installFromLocal(source);
  }

  // Validate the installed package
  const pkg = readPkgJsonSync(installPath);
  if (!pkg?.sero?.app?.id) {
    // Clean up on failure
    await fs.rm(installPath, { recursive: true, force: true });
    throw new Error(`Invalid plugin: missing sero.app.id in package.json`);
  }

  // Validate pre-built UI exists if declared
  if (pkg.sero.app.ui) {
    const distUi = path.join(installPath, 'dist', 'ui', 'remoteEntry.js');
    if (!existsSync(distUi)) {
      await fs.rm(installPath, { recursive: true, force: true });
      throw new Error(
        `Invalid plugin: declares UI but dist/ui/remoteEntry.js is missing. ` +
        `Plugin must be pre-built before installation.`,
      );
    }
  }

  // Register in settings.json
  addToSettings(installPath);

  // Register for app discovery and ext protocol
  registerAppPath(installPath);
  const apps = await discoverApps();
  const manifest = apps.find((a) => a.id === pkg.sero!.app!.id);
  if (manifest) {
    registerExtAssets(manifest);
    return manifest;
  }

  throw new Error(`Plugin installed but failed to discover: ${pkg.sero.app.id}`);
}

/**
 * Uninstall a plugin by ID.
 *
 * Removes from disk and settings.json. Does NOT clean up app state
 * files — that's the user's choice.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
  const pluginPath = path.join(PLUGINS_DIR, pluginId);

  // Verify it's actually in the plugins dir (not a monorepo package)
  if (!existsSync(pluginPath)) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  // Remove from disk
  await fs.rm(pluginPath, { recursive: true, force: true });

  // Remove from settings.json
  removeFromSettings(pluginPath);
}

/**
 * List all installed plugins (only from ~/.sero-ui/agent/packages/).
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
        results.push(manifestToInstalledPlugin(pkg, pkgPath, pkgPath));
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
  return existsSync(path.join(PLUGINS_DIR, pluginId, 'package.json'));
}

// ── Install strategies ──────────────────────────────────────

async function installFromNpm(spec: string): Promise<string> {
  // Use npm pack to download the tarball without node_modules pollution
  const tmpDir = path.join(PLUGINS_DIR, '.tmp-install');
  mkdirSync(tmpDir, { recursive: true });

  try {
    // Download and extract the package
    const { stdout } = await exec(`npm pack ${spec} --pack-destination .`, {
      cwd: tmpDir,
    });

    const tarball = stdout.trim().split('\n').pop()!;
    const tarPath = path.join(tmpDir, tarball);

    // Extract to temp location
    const extractDir = path.join(tmpDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    await exec(`tar -xzf "${tarPath}" -C "${extractDir}"`);

    // npm pack extracts into a 'package/' subdirectory
    const packageDir = path.join(extractDir, 'package');
    const pkg = readPkgJsonSync(packageDir);
    const pluginId = pkg?.sero?.app?.id;

    if (!pluginId) {
      throw new Error('Package does not contain a sero.app.id');
    }

    // Move to final destination
    const destDir = path.join(PLUGINS_DIR, pluginId);
    if (existsSync(destDir)) {
      await fs.rm(destDir, { recursive: true, force: true });
    }
    await fs.rename(packageDir, destDir);

    return destDir;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function installFromGit(url: string): Promise<string> {
  const tmpDir = path.join(PLUGINS_DIR, '.tmp-git');
  mkdirSync(tmpDir, { recursive: true });

  try {
    // Shallow clone
    await exec(`git clone --depth 1 "${url}" repo`, { cwd: tmpDir });
    const repoDir = path.join(tmpDir, 'repo');

    const pkg = readPkgJsonSync(repoDir);
    const pluginId = pkg?.sero?.app?.id;

    if (!pluginId) {
      throw new Error('Repository does not contain a sero.app.id');
    }

    // Remove .git to save space
    await fs.rm(path.join(repoDir, '.git'), { recursive: true, force: true });

    // Move to final destination
    const destDir = path.join(PLUGINS_DIR, pluginId);
    if (existsSync(destDir)) {
      await fs.rm(destDir, { recursive: true, force: true });
    }
    await fs.rename(repoDir, destDir);

    return destDir;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function installFromLocal(source: string): Promise<string> {
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) {
    throw new Error(`Local path does not exist: ${resolved}`);
  }

  const pkg = readPkgJsonSync(resolved);
  const pluginId = pkg?.sero?.app?.id;

  if (!pluginId) {
    throw new Error('Directory does not contain a sero.app.id');
  }

  // Copy to plugins dir
  const destDir = path.join(PLUGINS_DIR, pluginId);
  if (existsSync(destDir)) {
    await fs.rm(destDir, { recursive: true, force: true });
  }
  await fs.cp(resolved, destDir, { recursive: true });

  return destDir;
}

// ── Settings.json management ────────────────────────────────

function addToSettings(packagePath: string): void {
  const settings = readSettings();
  const packages = getPackagesArray(settings);

  // Check if already registered
  const exists = packages.some((entry) => {
    const src = typeof entry === 'string' ? entry : entry.source;
    return src === packagePath;
  });

  if (!exists) {
    packages.push(packagePath);
    settings.packages = packages;
    writeSettings(settings);
  }
}

function removeFromSettings(packagePath: string): void {
  const settings = readSettings();
  const packages = getPackagesArray(settings);

  settings.packages = packages.filter((entry) => {
    const src = typeof entry === 'string' ? entry : entry.source;
    return src !== packagePath;
  });

  writeSettings(settings);
}
