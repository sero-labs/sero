import { rename, rm } from 'node:fs/promises';

import {
  normalizeFullIndexRepairRequest,
  type FullIndexRepairRequest,
} from '../shared/index-repair';
import { bumpControlRevision } from '../shared/index-storage';
import type { DesignLibraryPaths } from '../shared/paths';
import { readJsonFile, writeJsonFile } from '../shared/state-io';
import { reindexExports } from './export-requests';
import { reindexGallery } from './gallery-store';
import { reindex } from './store';

const MAX_REPAIR_ATTEMPTS = 3;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failRepairRequest(
  paths: DesignLibraryPaths,
  request: FullIndexRepairRequest,
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
  const request = normalizeFullIndexRepairRequest(
    await readJsonFile<unknown>(paths.repairRequestFile),
  );
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
