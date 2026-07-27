import { describe, expect, it } from 'vitest';

import { deriveFacets, deriveStyleGroups, selectItems } from './search';
import { EMPTY_FILTERS, type ItemSummary, type ViewPreferences } from './types';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function item(overrides: Partial<ItemSummary> & { id: string }): ItemSummary {
  return {
    title: 'Untitled',
    primaryStyle: 'Dark luxury',
    tags: [],
    designTypes: [],
    kind: 'image',
    previewPath: `items/${overrides.id}/preview.webp`,
    analysisStatus: 'ready',
    favourite: false,
    collectionIds: [],
    colours: [],
    sourceKind: 'file',
    createdAt: NOW,
    updatedAt: NOW,
    edited: false,
    searchText: '',
    ...overrides,
  };
}

function view(overrides: Partial<ViewPreferences> = {}): ViewPreferences {
  return { scope: { kind: 'all' }, query: '', filters: EMPTY_FILTERS, sort: 'newest', ...overrides };
}

const ITEMS: ItemSummary[] = [
  item({ id: 'a', title: 'Northstar', primaryStyle: 'Technical monochrome', tags: ['dense'], favourite: true, searchText: 'northstar technical monochrome dense grid' }),
  item({ id: 'b', title: 'Material journal', primaryStyle: 'Editorial', tags: ['warm'], createdAt: NOW - 30 * DAY, searchText: 'material journal editorial warm overscale' }),
  item({ id: 'c', title: 'Signal archive', primaryStyle: 'Technical monochrome', analysisStatus: 'pending', kind: 'video', searchText: 'signal archive technical monochrome' }),
  item({ id: 'd', title: 'Deleted thing', deletedAt: NOW, searchText: 'deleted thing' }),
];

describe('scopes', () => {
  it('hides deleted items everywhere except Trash', () => {
    expect(selectItems(ITEMS, view(), NOW).map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
    expect(selectItems(ITEMS, view({ scope: { kind: 'trash' } }), NOW).map((entry) => entry.id)).toEqual(['d']);
  });

  it('selects favourites, awaiting analysis and recent additions', () => {
    expect(selectItems(ITEMS, view({ scope: { kind: 'favourites' } }), NOW).map((e) => e.id)).toEqual(['a']);
    expect(selectItems(ITEMS, view({ scope: { kind: 'awaiting' } }), NOW).map((e) => e.id)).toEqual(['c']);
    // 'b' is 30 days old, outside the recent window.
    expect(selectItems(ITEMS, view({ scope: { kind: 'recent' } }), NOW).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('selects a style group', () => {
    const selected = selectItems(ITEMS, view({ scope: { kind: 'style', style: 'Technical monochrome' } }), NOW);
    expect(selected.map((entry) => entry.id)).toEqual(['a', 'c']);
  });
});

describe('query', () => {
  it('requires every term to match somewhere', () => {
    expect(selectItems(ITEMS, view({ query: 'monochrome' }), NOW).map((e) => e.id)).toEqual(['a', 'c']);
    expect(selectItems(ITEMS, view({ query: 'monochrome grid' }), NOW).map((e) => e.id)).toEqual(['a']);
    expect(selectItems(ITEMS, view({ query: 'monochrome nonsense' }), NOW)).toEqual([]);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(selectItems(ITEMS, view({ query: '  EDITORIAL ' }), NOW).map((e) => e.id)).toEqual(['b']);
  });
});

describe('filters', () => {
  it('combines values within a facet with OR', () => {
    const filters = { ...EMPTY_FILTERS, styles: ['Editorial', 'Technical monochrome'] };
    expect(selectItems(ITEMS, view({ filters }), NOW).map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('combines facets with AND', () => {
    const filters = { ...EMPTY_FILTERS, styles: ['Technical monochrome'], mediaKinds: ['video' as const] };
    expect(selectItems(ITEMS, view({ filters }), NOW).map((e) => e.id)).toEqual(['c']);
  });

  it('treats an empty facet as inactive', () => {
    expect(selectItems(ITEMS, view({ filters: EMPTY_FILTERS }), NOW)).toHaveLength(3);
  });
});

describe('sorting', () => {
  it('orders by date or title', () => {
    expect(selectItems(ITEMS, view({ sort: 'oldest' }), NOW).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(selectItems(ITEMS, view({ sort: 'title' }), NOW).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('derived groups and facets', () => {
  it('groups by the Librarian primary style once a style has two members', () => {
    expect(deriveStyleGroups(ITEMS)).toEqual([{ style: 'Technical monochrome', count: 2 }]);
  });

  it('excludes deleted items from facets', () => {
    const facets = deriveFacets(ITEMS);
    expect(facets.styles).toEqual(['Editorial', 'Technical monochrome']);
    expect(facets.tags).toEqual(['dense', 'warm']);
  });
});
