import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { isBuiltinPackageDir } from './builtin-package-detection.js';

const MONOREPO_PACKAGES_CANDIDATES = [
  path.resolve(__dirname, '../../../../../../packages'),
  path.resolve(__dirname, '../../../../packages'),
  path.resolve(__dirname, '../../../packages'),
];

const MONOREPO_PLUGINS_CANDIDATES = [
  path.resolve(__dirname, '../../../../../../plugins'),
  path.resolve(__dirname, '../../../../plugins'),
  path.resolve(__dirname, '../../../plugins'),
];

const BUNDLED_PACKAGES_DIR = path.resolve(__dirname, 'builtin/packages');
const BUNDLED_PLUGINS_DIR = path.resolve(__dirname, 'builtin/plugins');
const BUNDLED_TEMPLATES_DIR = path.resolve(__dirname, 'builtin/templates');

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveBuiltinPackagesDir(): string | null {
  const monorepoPackages = firstExistingPath(MONOREPO_PACKAGES_CANDIDATES);
  if (monorepoPackages) return monorepoPackages;
  return existsSync(BUNDLED_PACKAGES_DIR) ? BUNDLED_PACKAGES_DIR : null;
}

export function resolveBuiltinTemplatesDir(): string | null {
  const monorepoPackages = firstExistingPath(MONOREPO_PACKAGES_CANDIDATES);
  if (monorepoPackages) {
    const templatesDir = path.join(monorepoPackages, 'templates');
    if (existsSync(templatesDir)) return templatesDir;
  }
  return existsSync(BUNDLED_TEMPLATES_DIR) ? BUNDLED_TEMPLATES_DIR : null;
}

export function discoverBuiltinPackagePaths(): string[] {
  const packagesDir = resolveBuiltinPackagesDir();
  if (!packagesDir) return [];

  try {
    return readdirSync(packagesDir)
      .filter((entry) => entry.startsWith('pi-'))
      .map((entry) => path.join(packagesDir, entry))
      .filter(isBuiltinPackageDir)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function resolveBuiltinPluginsDir(): string | null {
  const monorepoPlugins = firstExistingPath(MONOREPO_PLUGINS_CANDIDATES);
  if (monorepoPlugins) return monorepoPlugins;
  return existsSync(BUNDLED_PLUGINS_DIR) ? BUNDLED_PLUGINS_DIR : null;
}

export function discoverBuiltinPluginPaths(): string[] {
  const pluginsDir = resolveBuiltinPluginsDir();
  if (!pluginsDir) return [];

  try {
    return readdirSync(pluginsDir)
      .filter((entry) => entry.startsWith('sero-') && entry.endsWith('-plugin'))
      .map((entry) => path.join(pluginsDir, entry))
      .filter(isBuiltinPackageDir)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
