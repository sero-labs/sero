import { constants } from 'node:fs';
import { copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { normalizeExportSummary, type ExportSummary } from '../shared/export';
import { replaceIndex } from '../shared/index-storage';
import { normalizeExportIndex } from '../shared/indexes';
import type { DesignLibraryPaths } from '../shared/paths';
import { exportFile } from '../shared/paths';
import {
  commitMigratedState,
  readJsonFile,
  readUnnormalizedState,
  writeJsonFile,
} from '../shared/state-io';
import { normalizeState, STATE_SCHEMA_VERSION } from '../shared/types';
import { reindexGallery } from './gallery-store';
import { reindex } from './store';

const LEGACY_ARRAYS = ['items', 'designs', 'galleryFamilies', 'jobs', 'exports'] as const;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function needsIndexMigration(value: unknown): boolean {
  const state = object(value);
  if (!state) return false;
  return state.schemaVersion !== STATE_SCHEMA_VERSION || LEGACY_ARRAYS.some((key) => Array.isArray(state[key]));
}

function legacyExports(value: unknown): ExportSummary[] {
  const state = object(value);
  if (!state || !Array.isArray(state.exports)) return [];
  return state.exports.flatMap((candidate) => {
    const entry = normalizeExportSummary(candidate);
    return entry ? [entry] : [];
  });
}

async function rebuildExportIndex(paths: DesignLibraryPaths): Promise<string[]> {
  const names = await readdir(paths.exportsDir).catch(() => []);
  const recordNames = names.filter((name) => name.endsWith('.json') && name !== 'index.json');
  const records = await Promise.all(
    recordNames.map((name) => readJsonFile<unknown>(path.join(paths.exportsDir, name))),
  );
  const exports = records.flatMap((candidate) => {
    const entry = normalizeExportSummary(candidate);
    return entry ? [entry] : [];
  });
  await replaceIndex(paths, paths.exportsIndexFile, normalizeExportIndex, exports);
  return recordNames.filter((_, index) => records[index] === null);
}

export interface MigrationResult {
  migrated: boolean;
  unreadable: string[];
}

/** One-time migration. Media and generated files never move. */
export async function migrateLegacyState(paths: DesignLibraryPaths): Promise<MigrationResult> {
  const raw = await readUnnormalizedState(paths);
  if (!needsIndexMigration(raw)) return { migrated: false, unreadable: [] };

  for (const entry of legacyExports(raw)) await writeJsonFile(exportFile(paths, entry.id), entry);
  const unreadable = await reindex(paths, false);
  unreadable.push(...await reindexGallery(paths, false));
  unreadable.push(...await rebuildExportIndex(paths));

  await copyFile(
    paths.stateFile,
    path.join(paths.home, 'state.json.pre-index-backup'),
    constants.COPYFILE_EXCL,
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });

  await commitMigratedState(paths, (latest) => ({
    ...normalizeState(latest),
    schemaVersion: STATE_SCHEMA_VERSION,
  }));
  return { migrated: true, unreadable };
}
