import { describe, expect, it } from 'vitest';

import {
  normalizeDesignIndex,
  normalizeExportIndex,
  normalizeGalleryIndex,
  normalizeItemIndex,
  normalizeJobIndex,
  normalizeJobIndexEntry,
} from './indexes';

describe('entity index normalizers', () => {
  it('keeps a job’s live run id through normalization', () => {
    // The UI reads the normalized index, and its pending tile watches this id.
    // Dropping it here is what left the tile with only a spinner.
    const entry = normalizeJobIndexEntry({
      id: 'job-1',
      kind: 'media',
      status: 'running',
      target: { kind: 'library', slotId: 'slot-1' },
      createdAt: 1,
      runId: 'run-gen-1',
    });

    expect(entry?.runId).toBe('run-gen-1');
  });

  it('omits an absent or malformed run id rather than inventing one', () => {
    const base = { id: 'job-1', kind: 'media', status: 'running', target: { kind: 'library', slotId: 's' }, createdAt: 1 };
    expect(normalizeJobIndexEntry(base)?.runId).toBeUndefined();
    expect(normalizeJobIndexEntry({ ...base, runId: 42 })?.runId).toBeUndefined();
    expect(normalizeJobIndexEntry({ ...base, runId: '' })?.runId).toBeUndefined();
  });

  it('normalizes item list fields without detailed analysis', () => {
    const [item] = normalizeItemIndex([{
      id: 'itm-1', title: 'Poster', fileName: 'poster.png', primaryStyle: 'Editorial',
      tags: ['one', 2, 'seven'], designTypes: ['Landing'], kind: 'image', previewPath: 'preview.webp',
      analysisStatus: 'ready', favourite: true, collectionIds: [], colours: ['#fff'],
      sourceKind: 'file', createdAt: 1, updatedAt: 2, edited: false, notes: 'excluded',
    }]);
    expect(item?.tags).toEqual(['one', 'seven']);
    expect(item).not.toHaveProperty('notes');
  });

  it('drops invalid entries from every index', () => {
    expect(normalizeItemIndex([null])).toEqual([]);
    expect(normalizeDesignIndex([null])).toEqual([]);
    expect(normalizeGalleryIndex([null])).toEqual([]);
    expect(normalizeJobIndex([null])).toEqual([]);
    expect(normalizeExportIndex([null])).toEqual([]);
  });
});
