/**
 * Profile registry recovery — back up a broken `profiles.json`, reset it, or
 * rebuild it from the profiles that still exist on disk.
 *
 * Pure file operations: no Electron and no dialog. `recovery.ts` drives these
 * from the startup recovery dialog.
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

import { PROFILE_REGISTRY_PATH, writeRegistrySync } from './manager';
import type { SalvageCandidate } from './discovery';

const REGISTRY_PATH = PROFILE_REGISTRY_PATH;
const SERO_ROOT = path.dirname(REGISTRY_PATH);

export interface ProfileRegistryResetResult {
  registryPath: string;
  backupPath: string | null;
}

export interface ProfileRegistrySalvageResult extends ProfileRegistryResetResult {
  /** Number of profiles kept from the broken registry. */
  kept: number;
}

/**
 * Copy the current registry to `profiles.broken-<timestamp>.json`.
 * Returns null when there is no registry to back up.
 */
export function backupRegistrySync(): string | null {
  if (!existsSync(REGISTRY_PATH)) return null;

  mkdirSync(SERO_ROOT, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const backupPath = path.join(SERO_ROOT, `profiles.broken-${timestamp}.json`);
  copyFileSync(REGISTRY_PATH, backupPath);
  return backupPath;
}

/**
 * Preserve a malformed profiles.json for inspection, then replace it with a
 * fresh empty registry so the app can recover on next launch.
 */
export function backupAndResetRegistrySync(): ProfileRegistryResetResult {
  mkdirSync(SERO_ROOT, { recursive: true });
  const backupPath = backupRegistrySync();
  writeRegistrySync({ version: 1, activeProfileId: null, profiles: [] });
  return { registryPath: REGISTRY_PATH, backupPath };
}

/**
 * Keep the profiles a broken registry still names: back it up, then write a
 * valid registry with those entries and the first one active. Used by startup
 * recovery so a reset never strands profiles that exist on disk.
 */
export function salvageRegistrySync(
  candidates: SalvageCandidate[],
): ProfileRegistrySalvageResult {
  mkdirSync(SERO_ROOT, { recursive: true });
  const backupPath = backupRegistrySync();

  writeRegistrySync({
    version: 1,
    activeProfileId: candidates[0]?.id ?? null,
    profiles: candidates,
  });

  return { registryPath: REGISTRY_PATH, backupPath, kept: candidates.length };
}
