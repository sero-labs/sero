/**
 * Loop Catalog data model (see specs/14-loop-catalog.md).
 *
 * A catalog is a git repository of curated loop definitions. The official
 * Sero catalog ships baked in; users add more repos — a private company repo
 * is a team catalog for free. Renderer-safe: types only.
 */

import type { DeliveryDestinationId } from './delivery-types';
import type { SharedLoopDefinition } from './library-types';

/** A configured catalog repo. The official ref is constructed, never stored. */
export interface CatalogRepoRef {
  key: string;
  url: string;
  official: boolean;
  addedAt?: string;
  /** Last successful fetch; absent ⇒ never fetched. */
  lastFetchedAt?: string;
}

/** The repo's index file (`catalog.json` at the repo root). */
export interface CatalogIndex {
  version: 1;
  name: string;
  /** Entry slugs, each resolving to `loops/<slug>/`. */
  entries: string[];
}

/** Curated metadata for one entry (`loops/<slug>/catalog.json`). */
export interface CatalogEntryMeta {
  slug: string;
  name: string;
  /** What it does, in plain language. */
  description: string;
  /** Monotonic per-entry version; maps onto library versions on install. */
  version: number;
  /** Tool names checked against the live catalog at install (fail-soft). */
  requiredTools?: string[];
  /** Human-readable connector needs: "GitHub (gh login)", "Gmail (Google plugin)". */
  connectors?: string[];
  /** Display text: "fires on github:ci-failed" / "weekdays 8am". */
  recommendedTrigger?: string;
  delivery?: DeliveryDestinationId;
  costBand?: 'low' | 'medium' | 'high';
  modelTier?: 'LOW' | 'MED' | 'HIGH';
  limitations?: string;
}

/** A fully-read entry: curated metadata plus the portable definition payload. */
export interface CatalogEntry {
  repoKey: string;
  meta: CatalogEntryMeta;
  definition: SharedLoopDefinition;
  /** Optional `example-output.md`, shown on the entry detail. */
  exampleOutput?: string;
}

/** An entry hidden from the list because its files failed the format check. */
export interface CatalogEntryProblem {
  slug: string;
  reason: string;
}

/** Result of an on-demand refresh (shallow clone or pull). */
export interface CatalogRefreshResult {
  /** Cache root when one exists (fresh or stale); null ⇒ never fetched. */
  root: string | null;
  /** True when the fetch failed and the previously fetched cache is being shown. */
  stale: boolean;
  reason?: string;
  lastFetchedAt?: string;
}

/** Everything a repo's local cache currently holds, fail-soft per entry. */
export interface CatalogRepoContents {
  repo: CatalogRepoRef;
  /** Null ⇒ never fetched, or the repo has no catalog.json yet. */
  index: CatalogIndex | null;
  entries: CatalogEntry[];
  problems: CatalogEntryProblem[];
}
