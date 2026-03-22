/**
 * App discovery — scans Pi packages for `sero.app` manifests.
 *
 * Looks in:
 *   1. ~/.sero-ui/agent/extensions/ (Sero extensions, may have sero.app)
 *   2. Packages listed in ~/.sero-ui/agent/settings.json
 *   3. Explicitly registered app paths (for local dev)
 *
 * Each package.json with a `sero.app` key is parsed into a SeroAppManifest.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SeroAppManifest, SettingsPackageSource } from '../src/types/ipc';

import { SERO_AGENT_DIR, SERO_HOME } from './env';

const SERO_EXTENSIONS_DIR = path.join(SERO_AGENT_DIR, 'extensions');
const SERO_PACKAGES_DIR = path.join(SERO_AGENT_DIR, 'packages');

// ── Manifest parsing ─────────────────────────────────────────

interface PkgSeroApp {
  id: string;
  name: string;
  icon: string;
  stateFile: string;
  scope?: 'global' | 'workspace';
  ui?: string;
  component?: string;
  devPort?: number;
}

interface PkgSeroPlugin {
  category?: string;
  tags?: string[];
  minSeroVersion?: string;
  preBuilt?: boolean;
}

interface PkgJson {
  name?: string;
  description?: string;
  version?: string;
  sero?: { app?: PkgSeroApp; plugin?: PkgSeroPlugin };
}

// ── Selective dev mode ────────────────────────────────────────
// Keep in sync with the equivalent filter in vite.config.ts (Vite build process).

const devAppsEnv = process.env.SERO_DEV_APPS?.trim();
const selectiveDevFilter: Set<string> | 'all' =
  !devAppsEnv || devAppsEnv === 'all'
    ? 'all'
    : new Set(devAppsEnv.split(',').map((entry) => entry.trim()).filter(Boolean));

function isAppInDevMode(appId: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (selectiveDevFilter === 'all') return true;
  return selectiveDevFilter.has(appId);
}

export function isInstalledPluginPackagePath(packagePath: string): boolean {
  const resolvedPackagePath = path.resolve(packagePath);
  const resolvedPluginsDir = path.resolve(SERO_PACKAGES_DIR);
  return (
    resolvedPackagePath === resolvedPluginsDir ||
    resolvedPackagePath.startsWith(`${resolvedPluginsDir}${path.sep}`)
  );
}

export function getManifestDevPort(appId: string, packagePath: string, devPort: number | undefined): number | undefined {
  if (!devPort) return undefined;
  if (isInstalledPluginPackagePath(packagePath)) return undefined;
  return isAppInDevMode(appId) ? devPort : undefined;
}

function parseManifest(pkgJson: PkgJson, packagePath: string): SeroAppManifest | null {
  const app = pkgJson.sero?.app;
  if (!app || !app.id || !app.name) return null;

  let uiEntry: string | null = null;
  if (app.ui) {
    uiEntry = path.resolve(packagePath, app.ui);
  }

  const scope = app.scope === 'global' ? 'global' : 'workspace';
  const globalStatePath = scope === 'global'
    ? path.join(SERO_HOME, 'apps', app.id, 'state.json')
    : null;

  return {
    id: app.id,
    name: app.name,
    description: typeof pkgJson.description === 'string' ? pkgJson.description : null,
    version: typeof pkgJson.version === 'string' ? pkgJson.version : null,
    packageName: typeof pkgJson.name === 'string' ? pkgJson.name : null,
    icon: app.icon || 'box',
    stateFile: app.stateFile,
    scope,
    globalStatePath,
    uiEntry,
    component: app.component || null,
    devPort: getManifestDevPort(app.id, packagePath, app.devPort),
    packagePath,
    isPlugin: Boolean(pkgJson.sero?.plugin),
  };
}

// ── Scanning ─────────────────────────────────────────────────

/** Read and parse package.json from a directory. Returns null on failure. */
async function readPkgJson(dir: string): Promise<PkgJson | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw) as PkgJson;
  } catch {
    return null;
  }
}

/** Scan a directory for subdirectories containing sero app manifests. */
async function scanDir(dir: string): Promise<SeroAppManifest[]> {
  const results: SeroAppManifest[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = path.join(dir, entry.name);
      const pkg = await readPkgJson(pkgPath);
      if (pkg) {
        const manifest = parseManifest(pkg, pkgPath);
        if (manifest) results.push(manifest);
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }
  return results;
}

/**
 * Read additional extension/package paths from Sero's settings.json.
 * These are absolute paths or npm: / git: references we resolve to disk.
 */
async function scanSettingsPaths(): Promise<SeroAppManifest[]> {
  const results: SeroAppManifest[] = [];
  try {
    const raw = await fs.readFile(path.join(SERO_AGENT_DIR, 'settings.json'), 'utf8');
    const settings = JSON.parse(raw);

    // Check "packages" array for local package paths
    const packages: SettingsPackageSource[] = settings.packages ?? [];
    for (const pkgSource of packages) {
      const source = typeof pkgSource === 'string' ? pkgSource : pkgSource.source;
      if (typeof source !== 'string' || !source) continue;
      if (source.startsWith('npm:') || source.startsWith('git:')) continue;
      const resolved = path.resolve(source);
      const pkg = await readPkgJson(resolved);
      if (pkg) {
        const manifest = parseManifest(pkg, resolved);
        if (manifest) results.push(manifest);
      }
    }

    // Check "extensions" array for local paths
    const extensions: string[] = settings.extensions ?? [];
    for (const ext of extensions) {
      if (ext.startsWith('npm:') || ext.startsWith('git:')) continue;
      const resolved = path.resolve(ext);
      const pkg = await readPkgJson(resolved);
      if (pkg) {
        const manifest = parseManifest(pkg, resolved);
        if (manifest) results.push(manifest);
      }
    }

    // Check installed packages in ~/.sero-ui/agent/packages/
    const pkgDir = path.join(SERO_AGENT_DIR, 'packages');
    const fromPkgs = await scanDir(pkgDir);
    results.push(...fromPkgs);
  } catch {
    // settings.json missing or malformed — skip
  }
  return results;
}

// ── Public API ───────────────────────────────────────────────

/** Manually registered paths for local development. */
const registeredPaths: string[] = [];

/** Register an additional path to scan for sero apps (e.g. workspace-local). */
export function registerAppPath(absPath: string): void {
  if (!registeredPaths.includes(absPath)) {
    registeredPaths.push(absPath);
  }
}

/** Discover all Sero apps from all known locations. Deduplicates by app id. */
export async function discoverApps(): Promise<SeroAppManifest[]> {
  const all: SeroAppManifest[] = [];

  // 1. Sero extensions directory
  all.push(...await scanDir(SERO_EXTENSIONS_DIR));

  // 2. Settings paths + installed packages
  all.push(...await scanSettingsPaths());

  // 3. Manually registered paths
  for (const p of registeredPaths) {
    const pkg = await readPkgJson(p);
    if (pkg) {
      const manifest = parseManifest(pkg, p);
      if (manifest) all.push(manifest);
    }
  }

  // Deduplicate by app id (last wins — allows local dev overrides)
  const byId = new Map<string, SeroAppManifest>();
  for (const app of all) {
    if (byId.has(app.id)) {
      const existing = byId.get(app.id)!;
      if (existing.packagePath !== app.packagePath) {
        console.warn(
          `[app-discovery] Duplicate app id "${app.id}": ` +
          `"${existing.packagePath}" overridden by "${app.packagePath}"`,
        );
      }
    }
    byId.set(app.id, app);
  }

  return Array.from(byId.values());
}
