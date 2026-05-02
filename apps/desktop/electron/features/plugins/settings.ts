import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import { invalidatePackageProviderManifestCache } from '@electron/shared/providers/package-provider-manifests';
import type { SettingsPackageSource } from '@/types/ipc';

export const SETTINGS_PATH = path.join(SERO_AGENT_DIR, 'settings.json');

export function readSettings(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings.json must contain a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to read settings.json. Fix ~/.sero-ui/agent/settings.json and retry plugin operation. (${error instanceof Error ? error.message : 'unknown parse error'})`);
  }
}

export function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
  invalidatePackageProviderManifestCache();
}

export function getPackagesArray(settings: Record<string, unknown>): SettingsPackageSource[] {
  return Array.isArray(settings.packages)
    ? (settings.packages as SettingsPackageSource[])
    : [];
}

export function addPackageToSettings(packagePath: string): boolean {
  const settings = readSettings();
  const packages = getPackagesArray(settings);

  const exists = packages.some((entry) => {
    const source = typeof entry === 'string' ? entry : entry.source;
    return source === packagePath;
  });

  if (exists) return false;

  packages.push(packagePath);
  settings.packages = packages;
  writeSettings(settings);
  return true;
}

export function removePackageFromSettings(packagePath: string): void {
  const settings = readSettings();
  const packages = getPackagesArray(settings);

  settings.packages = packages.filter((entry) => {
    const source = typeof entry === 'string' ? entry : entry.source;
    return source !== packagePath;
  });

  writeSettings(settings);
}
