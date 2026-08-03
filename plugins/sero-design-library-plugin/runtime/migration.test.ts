import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readIndex } from '../shared/index-storage';
import {
  normalizeDesignIndex,
  normalizeExportIndex,
  normalizeGalleryIndex,
  normalizeItemIndex,
  normalizeJobIndex,
} from '../shared/indexes';
import { GALLERY_SCHEMA_VERSION, type GalleryFamilyRecord } from '../shared/gallery';
import {
  designLibraryPathsFromHome,
  galleryFamilyRecordFile,
  type DesignLibraryPaths,
} from '../shared/paths';
import { appendRequest, readStateWithIndexes, writeJsonFile } from '../shared/state-io';
import { createJob } from './jobs';
import { migrateLegacyState } from './migration';
import { seedDesign, seedItem } from './test-fixtures';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-migration-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => rm(home, { recursive: true, force: true }));

async function seedLegacyState(): Promise<void> {
  await seedItem(paths, 'itm-live', { status: 'ready' });
  await seedItem(paths, 'itm-deleted', { deleted: true });
  await seedDesign(paths, 'dsn-1', { variantCount: 1 });
  await createJob(paths, 'analysis', { kind: 'item', itemId: 'itm-live' });
  const family: GalleryFamilyRecord = {
    id: 'fam-1', schemaVersion: GALLERY_SCHEMA_VERSION, createdAt: 1, updatedAt: 2,
    title: 'Family', sourceDesignId: 'dsn-1', featuredVersionId: 'ver-1', favourite: true,
    versions: [{
      id: 'ver-1', createdAt: 1, title: 'Version', target: 'html',
      sourceVariantId: 'variant-1', sourceRevisionId: 'revision-1', previewFile: 'preview.png',
    }],
  };
  await writeJsonFile(galleryFamilyRecordFile(paths, family.id), family);
  await appendRequest(paths, { kind: 'item.favourite', itemId: 'itm-live', favourite: true });
  const current = await readStateWithIndexes(paths);
  await writeJsonFile(paths.stateFile, {
    ...current,
    schemaVersion: 1,
    collections: [{ id: 'col-1', name: 'Saved', colour: 'primary', createdAt: 1 }],
    items: current.items,
    designs: current.designs,
    galleryFamilies: [family],
    jobs: current.jobs,
    exports: [{
      id: 'exp-1', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
      status: 'succeeded', createdAt: 1, completedAt: 2, path: '/tmp/export',
    }],
  });
  await Promise.all([
    rm(paths.itemsIndexFile, { force: true }),
    rm(paths.designsIndexFile, { force: true }),
    rm(paths.galleryIndexFile, { force: true }),
    rm(paths.jobsIndexFile, { force: true }),
    rm(paths.exportsIndexFile, { force: true }),
  ]);
}

describe('legacy state migration', () => {
  it('moves every entity list to indexes and preserves bounded state', async () => {
    await seedLegacyState();
    const result = await migrateLegacyState(paths);
    expect(result).toEqual({ migrated: true, unreadable: [] });

    const raw = JSON.parse(await readFile(paths.stateFile, 'utf8')) as Record<string, unknown>;
    expect(raw.schemaVersion).toBe(2);
    for (const key of ['items', 'designs', 'galleryFamilies', 'jobs', 'exports']) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(raw.collections).toEqual([{ id: 'col-1', name: 'Saved', colour: 'primary', createdAt: 1 }]);
    expect(raw.requests).toHaveLength(1);
    expect(await readFile(path.join(home, 'state.json.pre-index-backup'), 'utf8')).toContain('"schemaVersion": 1');

    expect(await readIndex(paths.itemsIndexFile, normalizeItemIndex)).toHaveLength(3);
    expect((await readIndex(paths.itemsIndexFile, normalizeItemIndex)).find((item) => item.id === 'itm-deleted')?.deletedAt).toBeDefined();
    expect(await readIndex(paths.designsIndexFile, normalizeDesignIndex)).toHaveLength(1);
    expect(await readIndex(paths.galleryIndexFile, normalizeGalleryIndex)).toEqual([expect.objectContaining({ id: 'fam-1' })]);
    expect(await readIndex(paths.jobsIndexFile, normalizeJobIndex)).toHaveLength(1);
    expect(await readIndex(paths.exportsIndexFile, normalizeExportIndex)).toEqual([expect.objectContaining({ id: 'exp-1' })]);
  });

  it('is safe to retry when index files and the backup already exist', async () => {
    await seedLegacyState();
    await writeJsonFile(path.join(home, 'state.json.pre-index-backup'), { preserved: true });
    await expect(migrateLegacyState(paths)).resolves.toMatchObject({ migrated: true });
    await expect(migrateLegacyState(paths)).resolves.toEqual({ migrated: false, unreadable: [] });
    expect(await readFile(path.join(home, 'state.json.pre-index-backup'), 'utf8')).toContain('preserved');
  });
});
