import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { isBuiltinPackageDir } from './builtin-package-detection.js';

const BUNDLED_PACKAGES_DIR = path.resolve(__dirname, 'builtin/packages');
const BUNDLED_PLUGINS_DIR = path.resolve(__dirname, 'builtin/plugins');
const BUNDLED_TEMPLATES_DIR = path.resolve(__dirname, 'builtin/templates');

function readPackageName(packageJsonPath: string): string | null {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
    return typeof packageJson.name === 'string' ? packageJson.name : null;
  } catch {
    return null;
  }
}

function findDesktopPackageRoot(): string | null {
  let current = __dirname;
  while (current !== path.dirname(current)) {
    if (readPackageName(path.join(current, 'package.json')) === '@sero/desktop') {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

function resolveMonorepoDir(name: 'packages' | 'plugins'): string | null {
  const desktopRoot = findDesktopPackageRoot();
  if (!desktopRoot) return null;

  const candidate = path.resolve(desktopRoot, '../../', name);
  return existsSync(candidate) ? candidate : null;
}

export function resolveBuiltinPackagesDir(): string | null {
  const monorepoPackages = resolveMonorepoDir('packages');
  if (monorepoPackages) return monorepoPackages;
  return existsSync(BUNDLED_PACKAGES_DIR) ? BUNDLED_PACKAGES_DIR : null;
}

export function resolveBuiltinTemplatesDir(): string | null {
  const monorepoPackages = resolveMonorepoDir('packages');
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
  const monorepoPlugins = resolveMonorepoDir('plugins');
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
