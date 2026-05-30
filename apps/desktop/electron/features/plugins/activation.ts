import { promises as fs, readFileSync } from 'fs';
import path from 'path';

import {
  DefaultPackageManager,
  type PackageSource,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  discoverBuiltinPackagePaths,
  discoverBuiltinPluginPaths,
} from '@electron/platform/protocols/builtin-resources';
import { getPackageCompatibilityForResourcePath } from './resource-compatibility';
import { getPackagesArray, readSettings, writeSettings } from './settings';

const PLUGINS_DIR = path.join(SERO_AGENT_DIR, 'plugins');
const PLUGIN_META_FILENAME = '.sero-plugin-meta.json';

interface PluginPackageJson {
  sero?: {
    app?: unknown;
  };
}

interface PluginInstallMeta {
  installedAt?: string;
}

interface InstalledPluginPath {
  packagePath: string;
  installedAtMs: number | null;
}

function readPkgJsonSync(dir: string): PluginPackageJson | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PluginPackageJson;
  } catch {
    return null;
  }
}

function readPluginInstalledAtMs(packagePath: string): number | null {
  try {
    const raw = readFileSync(path.join(packagePath, PLUGIN_META_FILENAME), 'utf8');
    const meta = JSON.parse(raw) as PluginInstallMeta;
    if (!meta.installedAt) return null;

    const timestamp = Date.parse(meta.installedAt);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function compareInstalledPluginPaths(left: InstalledPluginPath, right: InstalledPluginPath): number {
  if (left.installedAtMs !== null && right.installedAtMs !== null && left.installedAtMs !== right.installedAtMs) {
    return left.installedAtMs - right.installedAtMs;
  }
  if (left.installedAtMs !== null && right.installedAtMs === null) return -1;
  if (left.installedAtMs === null && right.installedAtMs !== null) return 1;
  return left.packagePath.localeCompare(right.packagePath);
}

function isManagedPluginPackageSource(sourcePath: string): boolean {
  const resolvedPluginsDir = path.resolve(PLUGINS_DIR);
  const resolvedSource = path.resolve(sourcePath);
  return resolvedSource.startsWith(`${resolvedPluginsDir}${path.sep}`);
}

function getPackageEntrySource(entry: PackageSource): string | null {
  const source = typeof entry === 'string' ? entry : entry.source;
  return typeof source === 'string' && source ? source : null;
}

function createPackageManager(settings: Record<string, unknown>): DefaultPackageManager {
  return new DefaultPackageManager({
    cwd: SERO_AGENT_DIR,
    agentDir: SERO_AGENT_DIR,
    settingsManager: SettingsManager.inMemory(settings as { packages?: PackageSource[] }),
  });
}

function resolvePackageEntryPath(
  packageManager: DefaultPackageManager,
  source: string,
): string | null {
  return packageManager.getInstalledPath(source, 'user') ?? null;
}

function getBuiltinPackageSourcePaths(): Set<string> {
  return new Set(
    [...discoverBuiltinPackagePaths(), ...discoverBuiltinPluginPaths()]
      .map((packagePath) => path.resolve(packagePath)),
  );
}

function shouldKeepPackageEntry(
  packageManager: DefaultPackageManager,
  entry: PackageSource,
  builtinPackageSourcePaths: Set<string>,
): boolean {
  const source = getPackageEntrySource(entry);
  if (!source) return true;

  if (builtinPackageSourcePaths.has(path.resolve(source))) {
    return true;
  }

  const resolvedPath = resolvePackageEntryPath(packageManager, source);
  if (!resolvedPath) return true;

  if (builtinPackageSourcePaths.has(path.resolve(resolvedPath))) {
    return true;
  }

  return getPackageCompatibilityForResourcePath(resolvedPath)?.supported !== false;
}

async function collectCompatibleInstalledPluginPaths(): Promise<string[]> {
  const compatiblePaths: InstalledPluginPath[] = [];

  try {
    const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packagePath = path.join(PLUGINS_DIR, entry.name);
      const pkg = readPkgJsonSync(packagePath);
      if (!pkg?.sero?.app) continue;
      if (getPackageCompatibilityForResourcePath(packagePath)?.supported === false) continue;

      compatiblePaths.push({
        packagePath,
        installedAtMs: readPluginInstalledAtMs(packagePath),
      });
    }
  } catch {
    // Directory doesn't exist yet — no installed plugins to reconcile.
  }

  return compatiblePaths
    .sort(compareInstalledPluginPaths)
    .map((entry) => entry.packagePath);
}

export async function reconcileInstalledPluginActivation(): Promise<void> {
  const settings = readSettings();
  const packageEntries = getPackagesArray(settings) as PackageSource[];
  const packageManager = createPackageManager(settings);
  const builtinPackageSourcePaths = getBuiltinPackageSourcePaths();
  const keptEntries = packageEntries.filter((entry) =>
    shouldKeepPackageEntry(packageManager, entry, builtinPackageSourcePaths));

  const managedActivePaths = new Set(
    keptEntries
      .map((entry) => getPackageEntrySource(entry))
      .flatMap((source) => {
        if (!source) return [];
        const resolvedPath = resolvePackageEntryPath(packageManager, source);
        return resolvedPath && isManagedPluginPackageSource(resolvedPath)
          ? [path.resolve(resolvedPath)]
          : [];
      }),
  );

  const additionalManagedPaths = (await collectCompatibleInstalledPluginPaths())
    .filter((packagePath) => !managedActivePaths.has(path.resolve(packagePath)));

  const currentSources = packageEntries
    .map((entry) => getPackageEntrySource(entry))
    .filter((source): source is string => typeof source === 'string' && !!source);
  const nextEntries: PackageSource[] = [...keptEntries, ...additionalManagedPaths];
  const nextSources = nextEntries
    .map((entry) => getPackageEntrySource(entry))
    .filter((source): source is string => typeof source === 'string' && !!source);

  if (
    currentSources.length === nextSources.length
    && currentSources.every((source, index) => source === nextSources[index])
  ) {
    return;
  }

  settings.packages = nextEntries;
  writeSettings(settings);
}
