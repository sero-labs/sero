import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GALLERY_SCHEMA_VERSION, type GalleryFamilyRecord } from '../shared/gallery';
import { markIndexRepair } from '../shared/index-repair';
import {
  designLibraryPathsFromHome,
  exportFile,
  galleryFamilyRecordFile,
  type DesignLibraryPaths,
} from '../shared/paths';
import { readJsonFile, readStateWithIndexes, writeJsonFile } from '../shared/state-io';
import { runRequestedFullRepair } from './full-repair';
import { repairPendingIndexes } from './index-repair';
import { seedDesign, seedItem } from './test-fixtures';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-index-repair-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => rm(home, { recursive: true, force: true }));

describe('targeted index repair', () => {
  it('replays only interrupted item, Design, Gallery, and export projections', async () => {
    await seedItem(paths, 'itm-1', { status: 'ready' });
    await seedDesign(paths, 'dsn-1', { variantCount: 1 });
    const family: GalleryFamilyRecord = {
      id: 'fam-1',
      schemaVersion: GALLERY_SCHEMA_VERSION,
      createdAt: 1,
      updatedAt: 2,
      title: 'Family',
      sourceDesignId: 'dsn-1',
      featuredVersionId: 'ver-1',
      favourite: false,
      versions: [{
        id: 'ver-1',
        createdAt: 1,
        title: 'Version',
        target: 'html',
        sourceVariantId: 'variant-1',
        sourceRevisionId: 'revision-1',
        previewFile: 'preview.png',
      }],
    };
    await writeJsonFile(galleryFamilyRecordFile(paths, family.id), family);
    await writeJsonFile(exportFile(paths, 'exp-1'), {
      id: 'exp-1',
      familyId: 'fam-1',
      versionId: 'ver-1',
      destination: 'downloads',
      status: 'succeeded',
      createdAt: 1,
      completedAt: 2,
      path: '/tmp/export',
    });

    await Promise.all([
      writeJsonFile(paths.itemsIndexFile, []),
      writeJsonFile(paths.designsIndexFile, []),
      writeJsonFile(paths.galleryIndexFile, []),
      writeJsonFile(paths.exportsIndexFile, []),
      markIndexRepair(paths, 'items', 'itm-1'),
      markIndexRepair(paths, 'designs', 'dsn-1'),
      markIndexRepair(paths, 'gallery', 'fam-1'),
      markIndexRepair(paths, 'exports', 'exp-1'),
    ]);

    await expect(repairPendingIndexes(paths)).resolves.toBe(4);
    const state = await readStateWithIndexes(paths);
    expect(state.items.map((entry) => entry.id)).toEqual(['itm-1']);
    expect(state.designs.map((entry) => entry.id)).toEqual(['dsn-1']);
    expect(state.gallery.map((entry) => entry.id)).toEqual(['fam-1']);
    expect(state.exports.map((entry) => entry.id)).toEqual(['exp-1']);
    await expect(repairPendingIndexes(paths)).resolves.toBe(0);
  });

  it('runs a requested full repair and clears the request after success', async () => {
    await seedItem(paths, 'itm-full', { status: 'ready' });
    await writeJsonFile(exportFile(paths, 'exp-full'), {
      id: 'exp-full', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
      status: 'succeeded', createdAt: 1, completedAt: 2, path: '/tmp/export',
    });
    await Promise.all([
      writeJsonFile(paths.itemsIndexFile, []),
      writeJsonFile(paths.exportsIndexFile, []),
    ]);
    await writeJsonFile(paths.repairRequestFile, { requestedAt: 1 });

    await expect(runRequestedFullRepair(paths)).resolves.toEqual([]);
    const state = await readStateWithIndexes(paths);
    expect(state.items.map((entry) => entry.id)).toEqual(['itm-full']);
    expect(state.exports.map((entry) => entry.id)).toEqual(['exp-full']);
    expect(await readJsonFile(paths.repairRequestFile)).toBeNull();
  });
});
