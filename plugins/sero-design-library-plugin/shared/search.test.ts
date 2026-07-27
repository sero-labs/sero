import { describe, expect, it } from 'vitest';
import { collectFacets, filterLibraryItems, matchesSearch } from './search';
import { DEFAULT_LIBRARY_FILTERS } from './state';
import type { LibraryItemSummary } from './types';

function item(overrides: Partial<LibraryItemSummary> = {}): LibraryItemSummary {
  return {
    id: 'itm-1',
    title: 'Northstar operations',
    primaryStyle: 'Editorial dashboard',
    tags: ['dense', 'grid'],
    source: 'file-picker',
    colours: ['#101014'],
    analysisStatus: 'ready',
    createdAt: 1000,
    searchText: 'quiet ledger typography with generous rhythm',
    ...overrides,
  };
}

describe('matchesSearch', () => {
  it('covers title, tags and the flattened analysis', () => {
    expect(matchesSearch(item(), 'northstar')).toBe(true);
    expect(matchesSearch(item(), 'grid')).toBe(true);
    expect(matchesSearch(item(), 'ledger')).toBe(true);
    expect(matchesSearch(item(), 'nothing')).toBe(false);
  });

  it('requires every term', () => {
    expect(matchesSearch(item(), 'quiet ledger')).toBe(true);
    expect(matchesSearch(item(), 'quiet missing')).toBe(false);
  });
});

describe('filterLibraryItems', () => {
  const items = [
    item(),
    item({ id: 'itm-2', title: 'Evening finance', tags: ['calm'], analysisStatus: 'failed', createdAt: 2000 }),
    item({ id: 'itm-3', title: 'Deleted one', deletedAt: 3000, createdAt: 3000 }),
  ];

  it('hides deleted items by default', () => {
    const visible = filterLibraryItems(items, '', DEFAULT_LIBRARY_FILTERS);
    expect(visible.map((entry) => entry.id)).toEqual(['itm-2', 'itm-1']);
  });

  it('shows only deleted items when asked', () => {
    const visible = filterLibraryItems(items, '', { ...DEFAULT_LIBRARY_FILTERS, includeDeleted: true });
    expect(visible.map((entry) => entry.id)).toEqual(['itm-3']);
  });

  it('applies tag, status and date filters', () => {
    expect(filterLibraryItems(items, '', { ...DEFAULT_LIBRARY_FILTERS, tags: ['calm'] }))
      .toHaveLength(1);
    expect(filterLibraryItems(items, '', { ...DEFAULT_LIBRARY_FILTERS, analysisStatuses: ['failed'] }))
      .toHaveLength(1);
    expect(filterLibraryItems(items, '', { ...DEFAULT_LIBRARY_FILTERS, createdAfter: 1500 }))
      .toHaveLength(1);
  });
});

describe('collectFacets', () => {
  it('lists the distinct values available for filtering', () => {
    const facets = collectFacets([item(), item({ id: 'itm-2', tags: ['calm'], source: 'clipboard' })]);
    expect(facets.tags).toEqual(['calm', 'dense', 'grid']);
    expect(facets.sources).toEqual(['clipboard', 'file-picker']);
  });
});
