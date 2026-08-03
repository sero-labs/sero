import { rename, rm } from 'node:fs/promises';

import { bumpControlRevision } from '../shared/index-storage';
import type { DesignLibraryPaths } from '../shared/paths';
import { readJsonFile, writeJsonFile } from '../shared/state-io';
import { reindexExports } from './export-requests';
import { reindexGallery } from './gallery-store';
import { reindex } from './store';

const MAX_REPAIR_ATTEMPTS = 3;

interface FullRepairRequest {
  requestedAt: number;
  attempts: number;
}

function repairRequest(value: unknown): FullRepairRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.requestedAt !== 'number') return null;
  return {
    requestedAt: entry.requestedAt,
    attempts: typeof entry.attempts === 'number' && Number.isInteger(entry.attempts)
      ? Math.max(0, entry.attempts)
      : 0,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failRepairRequest(
  paths: DesignLibraryPaths,
  request: FullRepairRequest,
  error: unknown,
): Promise<void> {
  await writeJsonFile(paths.repairRequestFile, {
    ...request,
    failedAt: Date.now(),
    error: errorText(error),
  });
  await rm(paths.repairFailedFile, { force: true });
  await rename(paths.repairRequestFile, paths.repairFailedFile);
}

/** Run the user-requested authoritative scan before normal runtime work starts. */
export async function runRequestedFullRepair(
  paths: DesignLibraryPaths,
): Promise<string[] | null> {
  const request = repairRequest(await readJsonFile<unknown>(paths.repairRequestFile));
  if (request === null) return null;

  if (request.attempts >= MAX_REPAIR_ATTEMPTS) {
    const error = new Error('The full index repair reached its retry limit.');
    await failRepairRequest(paths, request, error);
    throw error;
  }

  const attempted = { ...request, attempts: request.attempts + 1 };
  await writeJsonFile(paths.repairRequestFile, attempted);
  try {
    const unreadable = (await Promise.all([
      reindex(paths, false),
      reindexGallery(paths, false),
      reindexExports(paths, false),
    ])).flat();
    await bumpControlRevision(paths);
    await rm(paths.repairRequestFile, { force: true });
    return unreadable;
  } catch (error) {
    if (attempted.attempts >= MAX_REPAIR_ATTEMPTS) {
      await failRepairRequest(paths, attempted, error);
    }
    throw error;
  }
}
