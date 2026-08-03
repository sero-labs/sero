import { rm } from 'node:fs/promises';

import { bumpControlRevision } from '../shared/index-storage';
import type { DesignLibraryPaths } from '../shared/paths';
import { readJsonFile } from '../shared/state-io';
import { reindexExports } from './export-requests';
import { reindexGallery } from './gallery-store';
import { reindex } from './store';

/** Run the user-requested authoritative scan before normal runtime work starts. */
export async function runRequestedFullRepair(
  paths: DesignLibraryPaths,
): Promise<string[] | null> {
  const request = await readJsonFile<unknown>(paths.repairRequestFile);
  if (request === null) return null;

  const unreadable = (await Promise.all([
    reindex(paths, false),
    reindexGallery(paths, false),
    reindexExports(paths, false),
  ])).flat();
  await bumpControlRevision(paths);
  await rm(paths.repairRequestFile, { force: true });
  return unreadable;
}
