import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as IndexStorage from '../shared/index-storage';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import type * as StateIo from '../shared/state-io';

const fault = vi.hoisted(() => ({ stage: null as 'record' | 'index' | 'control' | null }));

vi.mock('../shared/state-io', async (importOriginal) => {
  const actual = await importOriginal<typeof StateIo>();
  return {
    ...actual,
    writeJsonFile: async (filePath: string, value: unknown) => {
      if (fault.stage === 'record' && filePath.endsWith('/record.json')) {
        fault.stage = null;
        throw new Error('interrupted record write');
      }
      await actual.writeJsonFile(filePath, value);
    },
  };
});

vi.mock('../shared/index-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof IndexStorage>();
  return {
    ...actual,
    updateIndex: async (...args: Parameters<typeof actual.updateIndex>) => {
      if (fault.stage === 'index') {
        fault.stage = null;
        throw new Error('interrupted index write');
      }
      return actual.updateIndex(...args);
    },
    bumpControlRevision: async (...args: Parameters<typeof actual.bumpControlRevision>) => {
      if (fault.stage === 'control') {
        fault.stage = null;
        throw new Error('interrupted control-state write');
      }
      return actual.bumpControlRevision(...args);
    },
  };
});

import { emptyAnalysis } from '../shared/librarian';
import { readStateWithIndexes } from '../shared/state-io';
import { readItem, reindex, saveItem } from './store';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-interruption-'));
  paths = designLibraryPathsFromHome(home);
  fault.stage = null;
});

afterEach(async () => rm(home, { recursive: true, force: true }));

function item(): ItemRecord {
  return {
    id: 'item-1', schemaVersion: ITEM_SCHEMA_VERSION, createdAt: 1, updatedAt: 1,
    kind: 'image', source: { kind: 'file', fileName: 'source.png' },
    asset: { originalFile: 'original.png', previewFile: 'preview.webp', mediaType: 'image/png', bytes: 1, checksum: 'sum' },
    profile: { generated: emptyAnalysis('Reference'), overrides: {} },
    analysis: { status: 'ready', attempts: 1 }, favourite: false, collectionIds: [],
  };
}

describe('interrupted record projection writes', () => {
  it('publishes nothing when the record write is interrupted', async () => {
    fault.stage = 'record';
    await expect(saveItem(paths, item())).rejects.toThrow('interrupted record write');

    expect(await readItem(paths, 'item-1')).toBeNull();
    const state = await readStateWithIndexes(paths);
    expect(state.items).toEqual([]);
    expect(state.revision).toBe(0);
  });

  it('repairs a durable record after the index write is interrupted', async () => {
    fault.stage = 'index';
    await expect(saveItem(paths, item())).rejects.toThrow('interrupted index write');

    expect(await readItem(paths, 'item-1')).not.toBeNull();
    expect((await readStateWithIndexes(paths)).items).toEqual([]);

    await reindex(paths);
    const state = await readStateWithIndexes(paths);
    expect(state.items.map((entry) => entry.id)).toEqual(['item-1']);
    expect(state.revision).toBe(1);
  });

  it('keeps the record and index when the control-state write is interrupted', async () => {
    fault.stage = 'control';
    await expect(saveItem(paths, item())).rejects.toThrow('interrupted control-state write');

    const interrupted = await readStateWithIndexes(paths);
    expect(interrupted.items.map((entry) => entry.id)).toEqual(['item-1']);
    expect(interrupted.revision).toBe(0);

    await reindex(paths);
    expect((await readStateWithIndexes(paths)).revision).toBe(1);
  });
});
