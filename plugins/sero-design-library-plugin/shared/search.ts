/**
 * Keyword search and the approved first-release filters.
 *
 * Search covers title, tags, notes and user-visible Librarian analysis. The
 * searchable text for each item is precomputed by the runtime and carried on
 * the summary so the grid never reads full records.
 */

import type { LibraryFilters } from './state';
import type { LibraryItemSummary } from './types';

export function matchesSearch(item: LibraryItemSummary, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return true;

  const haystack = [item.title, item.primaryStyle, item.searchText ?? '', item.tags.join(' ')]
    .join(' ')
    .toLowerCase();

  return trimmed
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function matchesFilters(item: LibraryItemSummary, filters: LibraryFilters): boolean {
  // The Deleted filter is a view onto the recoverable items, not an addition
  // to the normal grid.
  if (filters.includeDeleted !== (item.deletedAt !== undefined)) return false;

  if (filters.tags.length > 0 && !filters.tags.every((tag) => item.tags.includes(tag))) {
    return false;
  }
  if (filters.colours.length > 0 && !filters.colours.some((colour) => item.colours.includes(colour))) {
    return false;
  }
  if (filters.sources.length > 0 && !filters.sources.includes(item.source)) {
    return false;
  }
  if (
    filters.analysisStatuses.length > 0
    && !filters.analysisStatuses.includes(item.analysisStatus)
  ) {
    return false;
  }
  if (filters.createdAfter !== undefined && item.createdAt < filters.createdAfter) {
    return false;
  }
  return true;
}

export function filterLibraryItems(
  items: LibraryItemSummary[],
  query: string,
  filters: LibraryFilters,
): LibraryItemSummary[] {
  return items
    .filter((item) => matchesFilters(item, filters) && matchesSearch(item, query))
    .sort((left, right) => right.createdAt - left.createdAt);
}

/** Distinct facet values present in the library, for the filter controls. */
export function collectFacets(items: LibraryItemSummary[]): {
  tags: string[];
  colours: string[];
  sources: string[];
} {
  const tags = new Set<string>();
  const colours = new Set<string>();
  const sources = new Set<string>();

  for (const item of items) {
    item.tags.forEach((tag) => tags.add(tag));
    item.colours.forEach((colour) => colours.add(colour));
    sources.add(item.source);
  }

  return {
    tags: [...tags].sort(),
    colours: [...colours].sort(),
    sources: [...sources].sort(),
  };
}
