import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyAnalysis } from '../shared/librarian';
import { designLibraryPathsFromHome, itemRecordFile, jobFile, type DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { readState, writeJsonFile } from '../shared/state-io';
import { listJobs, readItem, reindex, saveItem, scanItems } from './store';

/**
 * Records outlive the code that wrote them. These cover the case that took the
 * whole runtime down: a record left behind by an earlier version of the plugin.
 */

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-store-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function validItem(id: string): ItemRecord {
  const now = Date.now();
  return {
    id,
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind: 'image',
    source: { kind: 'file', fileName: `${id}.png` },
    asset: {
      originalFile: 'original.png',
      previewFile: 'preview.webp',
      mediaType: 'image/png',
      bytes: 10,
      checksum: `checksum-${id}`,
    },
    profile: { generated: emptyAnalysis(id), overrides: {} },
    analysis: { status: 'ready', attempts: 1 },
    favourite: false,
    collectionIds: [],
  };
}

/** The exact shape the superseded draft wrote: no `asset`, no `analysis`. */
const LEGACY_RECORD = {
  revision: 3,
  id: 'itm-legacy',
  createdAt: 1785111357193,
  updatedAt: 1785111357193,
  source: 'file',
  originalFileName: 'img1.jpeg',
  original: { fileName: 'original.jpg', mimeType: 'image/jpeg', byteLength: 1234, checksum: 'abc' },
  preview: { fileName: 'preview.webp', mimeType: 'image/webp', byteLength: 99, checksum: 'def' },
  analysisStatus: 'ready',
  analysisAttempts: 1,
  profile: { generated: {}, overrides: {} },
};

describe('reading records this version does not understand', () => {
  it('returns null instead of an unchecked object', async () => {
    await writeJsonFile(itemRecordFile(paths, 'itm-legacy'), LEGACY_RECORD);
    expect(await readItem(paths, 'itm-legacy')).toBeNull();
  });

  it('reports the unreadable record and keeps the readable ones', async () => {
    await saveItem(paths, validItem('good-1'));
    await saveItem(paths, validItem('good-2'));
    await writeJsonFile(itemRecordFile(paths, 'itm-legacy'), LEGACY_RECORD);

    const scan = await scanItems(paths);
    expect(scan.items.map((item) => item.id).sort()).toEqual(['good-1', 'good-2']);
    expect(scan.unreadable).toEqual(['itm-legacy']);
  });

  it('reindexes without throwing, and leaves the unreadable files on disk', async () => {
    await saveItem(paths, validItem('good-1'));
    await writeJsonFile(itemRecordFile(paths, 'itm-legacy'), LEGACY_RECORD);

    // The regression: this used to throw on `asset.previewFile`, which took
    // runtime start down with it and stopped every request being consumed.
    const unreadable = await reindex(paths);

    expect(unreadable).toEqual(['itm-legacy']);
    expect((await readState(paths)).items.map((item) => item.id)).toEqual(['good-1']);
    // Nothing is destroyed just because this version cannot read it.
    expect(await readItem(paths, 'itm-legacy')).toBeNull();
    await expect(
      import('node:fs/promises').then((fs) => fs.access(itemRecordFile(paths, 'itm-legacy'))),
    ).resolves.toBeUndefined();
  });

  it('drops a stale summary for a record that no longer validates', async () => {
    await saveItem(paths, validItem('good-1'));
    await writeJsonFile(itemRecordFile(paths, 'itm-legacy'), LEGACY_RECORD);
    // Reactive state still carries a summary written by the older version.
    const { updateState } = await import('../shared/state-io');
    await updateState(paths, (current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: 'itm-legacy',
          title: 'Image unavailable',
          primaryStyle: 'undetermined',
          tags: [],
          designTypes: [],
          kind: 'image' as const,
          previewPath: '',
          analysisStatus: 'ready' as const,
          favourite: false,
          collectionIds: [],
          colours: [],
          sourceKind: 'file',
          createdAt: 0,
          updatedAt: 0,
          edited: false,
          searchText: '',
        },
      ],
    }));

    await reindex(paths);
    expect((await readState(paths)).items.map((item) => item.id)).toEqual(['good-1']);
  });

  it('skips a truncated record rather than crashing on it', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(itemRecordFile(paths, 'itm-partial')), { recursive: true });
    await writeFile(itemRecordFile(paths, 'itm-partial'), '{"id":"itm-partial","asse', 'utf8');

    await expect(reindex(paths)).resolves.toEqual(['itm-partial']);
  });

  it('still projects a record whose analysis is missing fields', async () => {
    // A record can be structurally sound but carry a half-written profile.
    // The projection reads every analysis field, so they all have to exist.
    await writeJsonFile(itemRecordFile(paths, 'itm-thin'), {
      ...validItem('itm-thin'),
      profile: { generated: { title: 'Only a title' }, overrides: {} },
    });

    await expect(reindex(paths)).resolves.toEqual([]);
    const summary = (await readState(paths)).items.find((item) => item.id === 'itm-thin');
    expect(summary?.title).toBe('Only a title');
    expect(summary?.tags).toEqual([]);
    expect(summary?.colours).toEqual([]);
  });

  it('skips a job file from an older version', async () => {
    await writeJsonFile(jobFile(paths, 'job-legacy'), { id: 'job-legacy', state: 'done' });
    await writeJsonFile(jobFile(paths, 'job-ok'), {
      id: 'job-ok',
      kind: 'analysis',
      status: 'queued',
      itemId: 'good-1',
      createdAt: Date.now(),
      attempts: 0,
    });

    expect((await listJobs(paths)).map((job) => job.id)).toEqual(['job-ok']);
  });
});
