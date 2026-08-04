import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyAnalysis } from '../shared/librarian';
import { designLibraryPathsFromHome, itemDir, itemRecordFile, type DesignLibraryPaths } from '../shared/paths';
import { withRecordLock } from '../shared/state-io';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { mutateItem, readItem, saveItem } from './store';

/**
 * Two writers, one record.
 *
 * The atomic rename makes a single write safe and does nothing for a pair of
 * read-modify-write cycles that overlap — which is ordinary here, because an
 * analysis result and a user edit reach the same item from different callers.
 * Without a lock spanning read and write, the later writer silently discards
 * whatever the earlier one changed.
 */

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-concurrency-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function item(id: string): ItemRecord {
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
    analysis: { status: 'pending', attempts: 0 },
    favourite: false,
    collectionIds: [],
  };
}

describe('concurrent writes to one item record', () => {
  it('keeps both changes when an analysis result and a favourite land together', async () => {
    await saveItem(paths, item('itm-1'));

    // The analysis path writes a profile; the user path writes `favourite`.
    // Each reads the record, so an unserialised pair loses one of the two.
    await Promise.all([
      mutateItem(paths, 'itm-1', (current) => ({
        ...current,
        analysis: { ...current.analysis, status: 'ready', attempts: 1 },
      })),
      mutateItem(paths, 'itm-1', (current) => ({ ...current, favourite: true })),
    ]);

    const record = await readItem(paths, 'itm-1');
    expect(record?.favourite).toBe(true);
    expect(record?.analysis.status).toBe('ready');
  });

  it('does not lose an edit to a writer that read the record first', async () => {
    await saveItem(paths, item('itm-2'));

    // A deliberately slow transform. Under a lock the second writer waits and
    // sees the first writer's result; unserialised, it overwrites it.
    const slow = mutateItem(paths, 'itm-2', (current) => ({ ...current, favourite: true }));
    const fast = mutateItem(paths, 'itm-2', (current) => ({
      ...current,
      collectionIds: ['col-1'],
    }));
    await Promise.all([slow, fast]);

    const record = await readItem(paths, 'itm-2');
    expect(record?.favourite).toBe(true);
    expect(record?.collectionIds).toEqual(['col-1']);
  });

  it('serialises a burst of writes without dropping any of them', async () => {
    await saveItem(paths, item('itm-3'));

    await Promise.all(
      Array.from({ length: 12 }, (_unused, index) =>
        mutateItem(paths, 'itm-3', (current) => ({
          ...current,
          collectionIds: [...current.collectionIds, `col-${index}`],
        })),
      ),
    );

    const record = await readItem(paths, 'itm-3');
    expect(record?.collectionIds).toHaveLength(12);
    expect(new Set(record?.collectionIds).size).toBe(12);
  });

  it('leaves no temp files behind when writes overlap', async () => {
    await saveItem(paths, item('itm-4'));

    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        mutateItem(paths, 'itm-4', (current) => ({ ...current, collectionIds: [`col-${index}`] })),
      ),
    );

    // A shared temp name lets one write rename a file another is still filling.
    const entries = await readdir(itemDir(paths, 'itm-4'));
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps the lock outside the directory it guards', async () => {
    await saveItem(paths, item('itm-lock'));

    // A lock stored inside the item directory is destroyed by a permanent
    // delete while its holder is still mid-transaction — which hands the mutex
    // to another process and leaves this one to delete that successor's lock.
    let heldDuringDelete: string[] = [];
    await withRecordLock(paths, itemRecordFile(paths, 'itm-lock'), async () => {
      await rm(itemDir(paths, 'itm-lock'), { recursive: true, force: true });
      heldDuringDelete = await readdir(paths.recordLocksDir).catch(() => []);
    });

    expect(heldDuringDelete.length).toBeGreaterThan(0);
  });

  it('reports a record that disappeared rather than recreating it', async () => {
    await saveItem(paths, item('itm-5'));
    await rm(itemDir(paths, 'itm-5'), { recursive: true, force: true });

    expect(await mutateItem(paths, 'itm-5', (current) => ({ ...current, favourite: true }))).toBeNull();
    expect(await readItem(paths, 'itm-5')).toBeNull();
  });
});
