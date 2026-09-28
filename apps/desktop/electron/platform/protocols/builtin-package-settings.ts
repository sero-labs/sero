import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { SettingsPackageSource } from '@/types/ipc';

export interface BuiltinPackageCleanupResult {
  packages: SettingsPackageSource[];
  changed: boolean;
  removedSources: string[];
}

export function getPackageSource(entry: SettingsPackageSource): string | null {
  if (typeof entry === 'string') return entry;
  return typeof entry.source === 'string' ? entry.source : null;
}

export function removeStaleBuiltinPackages(
  packages: SettingsPackageSource[],
  currentPackagePaths: string[],
): BuiltinPackageCleanupResult {
  const currentSources = new Set(currentPackagePaths.map((packagePath) => path.resolve(packagePath)));
  const currentIdentities = currentPackagePaths.map(readSeroPackageIdentity);
  const currentAppIds = new Set(currentIdentities.map((identity) => identity?.appId).filter((id): id is string => !!id));
  const currentExtensionNames = new Set(currentIdentities.map((identity) => identity?.extensionName).filter((name): name is string => !!name));
  const removedSources: string[] = [];

  const nextPackages = packages.filter((entry) => {
    const source = getPackageSource(entry);
    if (!source) return true;

    const resolvedSource = path.resolve(source);
    if (currentSources.has(resolvedSource)) return true;

    const identity = readSeroPackageIdentity(resolvedSource);
    const shouldRemove = (identity?.appId && currentAppIds.has(identity.appId))
      || (identity?.extensionName && currentExtensionNames.has(identity.extensionName));
    if (shouldRemove) {
      removedSources.push(source);
    }
    return !shouldRemove;
  });

  for (const source of removedSources) {
    console.log(`[sero] Removed stale built-in package path from settings: ${source}`);
  }

  return {
    packages: nextPackages,
    changed: removedSources.length > 0,
    removedSources,
  };
}

function readSeroPackageIdentity(packagePath: string): { appId: string | null; extensionName: string | null } | null {
  const packageJsonPath = path.join(packagePath, 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  try {
    const pkgJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      name?: unknown;
      sero?: { app?: { id?: unknown }; plugin?: unknown };
    };
    const appId = typeof pkgJson.sero?.app?.id === 'string' ? pkgJson.sero.app.id : null;
    const extensionName = !appId && pkgJson.sero?.plugin && typeof pkgJson.name === 'string'
      ? pkgJson.name
      : null;
    return { appId, extensionName };
  } catch {
    return null;
  }
}

