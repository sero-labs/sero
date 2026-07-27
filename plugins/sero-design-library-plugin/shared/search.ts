/**
 * Selecting what the grid shows. Pure functions over summaries so the UI, the
 * extension's read tools and tests all agree on what "Favourites, tagged
 * 'editorial', matching 'grid'" means.
 */

import type { ItemSummary, LibraryFilters, LibraryScope, LibrarySort, ViewPreferences } from './types';

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Every term must match somewhere in the item's searchable text. */
export function matchesQuery(item: ItemSummary, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term !== '');
  if (terms.length === 0) return true;
  return terms.every((term) => item.searchText.includes(term));
}

export function matchesScope(item: ItemSummary, scope: LibraryScope, now: number): boolean {
  // Deleted items are visible in Trash and nowhere else.
  const deleted = item.deletedAt !== undefined;
  if (scope.kind === 'trash') return deleted;
  if (deleted) return false;

  switch (scope.kind) {
    case 'all':
      return true;
    case 'favourites':
      return item.favourite;
    case 'awaiting':
      return item.analysisStatus !== 'ready';
    case 'recent':
      return now - item.createdAt <= RECENT_WINDOW_MS;
    case 'collection':
      return item.collectionIds.includes(scope.collectionId);
    case 'style':
      return item.primaryStyle === scope.style;
  }
}

/** A filter with no selections is inactive; selections within one filter are OR. */
function passesList<T>(selected: T[], has: (value: T) => boolean): boolean {
  return selected.length === 0 || selected.some(has);
}

export function matchesFilters(item: ItemSummary, filters: LibraryFilters): boolean {
  if (!passesList(filters.mediaKinds, (kind) => item.kind === kind)) return false;
  if (!passesList(filters.styles, (style) => item.primaryStyle === style)) return false;
  if (!passesList(filters.tags, (tag) => item.tags.includes(tag))) return false;
  if (!passesList(filters.colours, (colour) => item.colours.includes(colour))) return false;
  if (!passesList(filters.sourceKinds, (source) => item.sourceKind === source)) return false;
  if (!passesList(filters.analysisStatuses, (status) => item.analysisStatus === status)) return false;
  if (filters.createdAfter !== undefined && item.createdAt < filters.createdAfter) return false;
  return true;
}

export function sortItems(items: ItemSummary[], sort: LibrarySort): ItemSummary[] {
  // `toSorted` returns a new array, so the copy-then-sort dance is unnecessary.
  switch (sort) {
    case 'oldest':
      return items.toSorted((a, b) => a.createdAt - b.createdAt);
    case 'title':
      return items.toSorted((a, b) => a.title.localeCompare(b.title));
    case 'newest':
      return items.toSorted((a, b) => b.createdAt - a.createdAt);
  }
}

export function selectItems(
  items: ItemSummary[],
  view: ViewPreferences,
  now = Date.now(),
): ItemSummary[] {
  const matched = items.filter(
    (item) =>
      matchesScope(item, view.scope, now) &&
      matchesFilters(item, view.filters) &&
      matchesQuery(item, view.query),
  );
  return sortItems(matched, view.sort);
}

/**
 * Style groups are derived, not learned. They are the Librarian's own
 * `primaryStyle` values counted across live items — no embeddings, no extra
 * model calls (spec §5.1).
 */
export interface StyleGroup {
  style: string;
  count: number;
}

export function deriveStyleGroups(items: ItemSummary[], minimumMembers = 2): StyleGroup[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.deletedAt !== undefined) continue;
    const style = item.primaryStyle.trim();
    if (style === '') continue;
    counts.set(style, (counts.get(style) ?? 0) + 1);
  }
  return [...counts.entries()]
    .flatMap(([style, count]) => (count >= minimumMembers ? [{ style, count }] : []))
    .sort((a, b) => b.count - a.count || a.style.localeCompare(b.style));
}

/** Facet values present in the live library, for building filter menus. */
export interface LibraryFacets {
  styles: string[];
  tags: string[];
  colours: string[];
  sourceKinds: string[];
}

export function deriveFacets(items: ItemSummary[]): LibraryFacets {
  const styles = new Set<string>();
  const tags = new Set<string>();
  const colours = new Set<string>();
  const sourceKinds = new Set<string>();
  for (const item of items) {
    if (item.deletedAt !== undefined) continue;
    if (item.primaryStyle !== '') styles.add(item.primaryStyle);
    item.tags.forEach((tag) => tags.add(tag));
    item.colours.forEach((colour) => colours.add(colour));
    sourceKinds.add(item.sourceKind);
  }
  // `Array.from` rather than a spread: this materialises a Set, it is not a
  // defensive copy of an array that `toSorted` would replace.
  const sorted = (values: Set<string>) => Array.from(values).sort((a, b) => a.localeCompare(b));
  return {
    styles: sorted(styles),
    tags: sorted(tags),
    colours: sorted(colours),
    sourceKinds: sorted(sourceKinds),
  };
}
