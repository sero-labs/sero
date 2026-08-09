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
  const currentAppIds = getCurrentBuiltinAppIds(currentPackagePaths);
  const removedSources: string[] = [];

  const nextPackages = packages.filter((entry) => {
    const source = getPackageSource(entry);
    if (!source) return true;

    const resolvedSource = path.resolve(source);
    if (currentSources.has(resolvedSource)) return true;

    const sourceAppId = readSeroAppId(resolvedSource);
    const shouldRemove = sourceAppId && currentAppIds.has(sourceAppId);
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

function getCurrentBuiltinAppIds(packagePaths: string[]): Set<string> {
  return new Set(packagePaths.map(readSeroAppId).filter((id): id is string => id !== null));
}

function readSeroAppId(packagePath: string): string | null {
  const packageJsonPath = path.join(packagePath, 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  try {
    const pkgJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      sero?: { app?: { id?: unknown } };
    };
    return typeof pkgJson.sero?.app?.id === 'string' ? pkgJson.sero.app.id : null;
  } catch {
    return null;
  }
}

