import { promises as fs } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  extractPluginCompatibilityRequirements,
  hasPluginDeclaration,
} from '../apps/discovery/plugin-meta';
import { evaluatePluginCompatibility } from './compatibility';
import { getPackagesArray, readSettings, writeSettings } from './settings';

const PLUGINS_DIR = path.join(SERO_AGENT_DIR, 'packages');

interface PluginPackageJson {
  sero?: {
    app?: unknown;
    plugin?: unknown;
  };
}

function readPkgJsonSync(dir: string): PluginPackageJson | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PluginPackageJson;
  } catch {
    return null;
  }
}

function isManagedPluginPackageSource(source: string): boolean {
  const resolvedPluginsDir = path.resolve(PLUGINS_DIR);
  const resolvedSource = path.resolve(source);
  return resolvedSource.startsWith(`${resolvedPluginsDir}${path.sep}`);
}

async function collectCompatibleInstalledPluginPaths(): Promise<string[]> {
  const compatiblePaths: string[] = [];

  try {
    const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packagePath = path.join(PLUGINS_DIR, entry.name);
      const pkg = readPkgJsonSync(packagePath);
      if (!pkg?.sero?.app) continue;

      const plugin = hasPluginDeclaration(pkg)
        ? extractPluginCompatibilityRequirements(pkg.sero?.plugin)
        : null;
      const compatibility = evaluatePluginCompatibility(plugin);
      if (compatibility?.supported === false) continue;

      compatiblePaths.push(packagePath);
    }
  } catch {
    // Directory doesn't exist yet — no installed plugins to reconcile.
  }

  return compatiblePaths.sort((left, right) => left.localeCompare(right));
}

export async function reconcileInstalledPluginActivation(): Promise<void> {
  const settings = readSettings();
  const compatiblePluginPaths = await collectCompatibleInstalledPluginPaths();
  const packageEntries = getPackagesArray(settings);
  const unmanagedEntries = packageEntries.filter((entry) => {
    const source = typeof entry === 'string' ? entry : entry.source;
    return !(typeof source === 'string' && source && isManagedPluginPackageSource(source));
  });

  const currentSources = packageEntries
    .map((entry) => typeof entry === 'string' ? entry : entry.source)
    .filter((source): source is string => typeof source === 'string' && !!source);
  const nextSources = [
    ...unmanagedEntries
      .map((entry) => typeof entry === 'string' ? entry : entry.source)
      .filter((source): source is string => typeof source === 'string' && !!source),
    ...compatiblePluginPaths,
  ];

  if (
    currentSources.length === nextSources.length
    && currentSources.every((source, index) => source === nextSources[index])
  ) {
    return;
  }

  settings.packages = [...unmanagedEntries, ...compatiblePluginPaths];
  writeSettings(settings);
}
