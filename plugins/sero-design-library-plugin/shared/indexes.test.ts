import { describe, expect, it } from 'vitest';

import {
  normalizeDesignIndex,
  normalizeExportIndex,
  normalizeGalleryIndex,
  normalizeItemIndex,
  normalizeJobIndex,
} from './indexes';

describe('entity index normalizers', () => {
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
