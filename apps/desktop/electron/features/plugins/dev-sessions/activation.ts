import path from 'path';
import type { PackageSource } from '@mariozechner/pi-coding-agent';
import type { SeroAppManifest } from '@/types/ipc';
import { registerExtAssets, unregisterExtAssets } from '@electron/platform/protocols/ext-protocol';
import { getPackagesArray, readSettings, writeSettings } from '../settings';
import { getActivePluginDevSessionRecords } from './conflicts';
import { readPluginDevSessionRecords } from './settings';

function normalizePath(value: string): string {
  return path.resolve(value);
}

function getPackageEntrySource(entry: PackageSource): string | null {
  const source = typeof entry === 'string' ? entry : entry.source;
  return typeof source === 'string' && source ? source : null;
}

function uniquePaths(paths: Iterable<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const candidate of paths) {
    const resolved = normalizePath(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    ordered.push(resolved);
  }

  return ordered;
}

export function getKnownPluginDevSessionSourcePaths(): string[] {
  return uniquePaths(readPluginDevSessionRecords().map((record) => record.sourcePath));
}

export function getProjectedPluginDevSessionSourcePaths(): string[] {
  return uniquePaths(getActivePluginDevSessionRecords().map((record) => record.sourcePath));
}

export async function reconcileActiveDevSessionPackages(activeSourcePaths: string[]): Promise<void> {
  const settings = readSettings();
  const packageEntries = getPackagesArray(settings) as PackageSource[];
  const knownDevSessionPaths = new Set(getKnownPluginDevSessionSourcePaths());
  const projectedActivePaths = uniquePaths(activeSourcePaths);

  const keptEntries = packageEntries.filter((entry) => {
    const source = getPackageEntrySource(entry);
    return !source || !knownDevSessionPaths.has(normalizePath(source));
  });

  const nextEntries: PackageSource[] = [...keptEntries, ...projectedActivePaths];
  const currentSources = packageEntries.map(getPackageEntrySource);
  const nextSources = nextEntries.map(getPackageEntrySource);

  if (
    currentSources.length === nextSources.length
    && currentSources.every((source, index) => source === nextSources[index])
  ) {
    return;
  }

  settings.packages = nextEntries;
  writeSettings(settings);
}

export function reconcileActiveDevSessionExtAssets(activeManifests: SeroAppManifest[]): void {
  const allRecords = readPluginDevSessionRecords();
  const activeAppIds = new Set(
    getActivePluginDevSessionRecords(allRecords)
      .map((record) => record.expectedAppId)
      .filter((appId): appId is string => typeof appId === 'string' && appId.length > 0),
  );
  const activeManifestIds = new Set<string>();

  for (const manifest of activeManifests) {
    if (!activeAppIds.has(manifest.id)) continue;
    activeManifestIds.add(manifest.id);

    if (manifest.uiEntry) {
      registerExtAssets(manifest);
    } else {
      unregisterExtAssets(manifest.id);
    }
  }

  for (const record of allRecords) {
    if (!record.expectedAppId) continue;
    if (!isActiveRecordWithManifest(record.expectedAppId, activeAppIds, activeManifestIds)) {
      unregisterExtAssets(record.expectedAppId);
    }
  }
}

function isActiveRecordWithManifest(
  appId: string,
  activeAppIds: Set<string>,
  activeManifestIds: Set<string>,
): boolean {
  return activeAppIds.has(appId) && activeManifestIds.has(appId);
}

export async function reconcileActiveDevSessionProjection(activeManifests: SeroAppManifest[]): Promise<void> {
  await reconcileActiveDevSessionPackages(activeManifests.map((manifest) => manifest.packagePath));
  reconcileActiveDevSessionExtAssets(activeManifests);
}
