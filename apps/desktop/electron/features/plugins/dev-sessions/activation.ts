import path from 'path';
import type { PackageSource } from '@earendil-works/pi-coding-agent';
import type { SeroAppManifest } from '@/types/ipc';
import { registerExtAssets, unregisterExtAssets } from '@electron/platform/protocols/ext-protocol';
import {
  registerRemoteWidgets,
  unregisterRemoteWidgets,
} from '@electron/features/gateway/server/remote-widgets';
import { getPackagesArray, readSettings, writeSettings } from '../settings';
import { getActivePluginDevSessionRecords } from './conflicts';
import { readPluginDevSessionRecords } from './settings';

function normalizePath(value: string): string {
  return path.resolve(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

function readPluginDevSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const seroSettings = settings.sero;
  if (!isObjectRecord(seroSettings)) {
    return {};
  }

  const pluginDevSettings = seroSettings.pluginDev;
  return isObjectRecord(pluginDevSettings) ? pluginDevSettings : {};
}

function readProjectedPackagePaths(settings: Record<string, unknown>): string[] {
  const projectedPackagePaths = readPluginDevSettings(settings).projectedPackagePaths;
  if (!Array.isArray(projectedPackagePaths)) {
    return [];
  }

  return uniquePaths(
    projectedPackagePaths.filter((value): value is string => (
      typeof value === 'string' && value.trim().length > 0
    )),
  );
}

function writeProjectedPackagePaths(
  settings: Record<string, unknown>,
  projectedPackagePaths: string[],
): void {
  const seroSettings = isObjectRecord(settings.sero) ? settings.sero : {};
  const pluginDevSettings = readPluginDevSettings(settings);

  settings.sero = {
    ...seroSettings,
    pluginDev: {
      ...pluginDevSettings,
      projectedPackagePaths,
    },
  };
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
  const projectedPackagePaths = readProjectedPackagePaths(settings);
  const projectedPackagePathSet = new Set(projectedPackagePaths);

  const keptEntries = packageEntries.filter((entry) => {
    const source = getPackageEntrySource(entry);
    if (!source || typeof entry !== 'string') {
      return true;
    }
    return !projectedPackagePathSet.has(normalizePath(source));
  });

  const keptSourcePaths = new Set(
    keptEntries
      .map(getPackageEntrySource)
      .filter((source): source is string => typeof source === 'string')
      .map(normalizePath),
  );
  const nextProjectedPackagePaths = uniquePaths(activeSourcePaths)
    .filter((sourcePath) => !keptSourcePaths.has(normalizePath(sourcePath)));
  const nextEntries: PackageSource[] = [...keptEntries, ...nextProjectedPackagePaths];
  const currentSources = packageEntries.map(getPackageEntrySource);
  const nextSources = nextEntries.map(getPackageEntrySource);

  if (
    currentSources.length === nextSources.length
    && currentSources.every((source, index) => source === nextSources[index])
    && projectedPackagePaths.length === nextProjectedPackagePaths.length
    && projectedPackagePaths.every((sourcePath, index) => sourcePath === nextProjectedPackagePaths[index])
  ) {
    return;
  }

  settings.packages = nextEntries;
  writeProjectedPackagePaths(settings, nextProjectedPackagePaths);
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
      registerRemoteWidgets(manifest);
    } else {
      unregisterExtAssets(manifest.id);
      unregisterRemoteWidgets(manifest.id);
    }
  }

  for (const record of allRecords) {
    if (!record.expectedAppId) continue;
    if (!isActiveRecordWithManifest(record.expectedAppId, activeAppIds, activeManifestIds)) {
      unregisterExtAssets(record.expectedAppId);
      unregisterRemoteWidgets(record.expectedAppId);
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
