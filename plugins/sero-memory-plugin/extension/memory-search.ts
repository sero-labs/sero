/**
 * Scores the entries of one or more scopes against a query (design D6).
 *
 * `recall` searches on-match entries only: pinned and unsorted entries are
 * already in the prompt, and the old daily and session files are never read.
 * `close` searches every entry folder of a scope, for the save-time check.
 */

import { listEntries, type ScopeLocation, type StoredEntry } from './entry-store';
import { collectionsFor, vectorSearch, type SearchMode } from './qmd-index';
import { entryScore } from './search-score';

export interface ScoredEntry {
  entry: StoredEntry;
  score: number;
}

export interface EntrySearchResult {
  results: ScoredEntry[];
  mode: SearchMode;
}

export async function searchEntries(
  query: string,
  locations: ScopeLocation[],
  kind: 'recall' | 'close',
): Promise<EntrySearchResult> {
  const deliveries = kind === 'recall' ? ['on-match'] as const : ['pinned', 'on-match', 'unsorted'] as const;
  const entries: StoredEntry[] = [];
  for (const location of locations) {
    for (const delivery of deliveries) entries.push(...await listEntries(location, delivery));
  }
  if (entries.length === 0) return { results: [], mode: 'keyword' };

  const collections = locations.map((location) => (kind === 'recall' ? collectionsFor(location).recall : collectionsFor(location).all));
  const vector = await vectorSearch(query, collections);
  const results = entries
    .map((entry) => ({ entry, score: entryScore(entry.terms, query, vector.similarity.get(entry.id) ?? 0) }))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  return { results, mode: vector.mode };
}
