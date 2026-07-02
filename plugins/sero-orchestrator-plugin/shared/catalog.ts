/**
 * Pure catalog helpers shared by runtime and renderer. Format checks only —
 * a definition gets the full plan validation at install time (runtime/schema.ts),
 * exactly like a library load.
 */

import type { CatalogEntry, CatalogEntryMeta, CatalogIndex } from './catalog-types';
import { isDeliveryDestinationId } from './delivery-types';
import type { LibraryEntry, LibraryVersion } from './library-types';

/** The baked-in official catalog repo (spec 14). Non-removable. */
export const OFFICIAL_CATALOG_KEY = 'official';
export const OFFICIAL_CATALOG_URL = 'https://github.com/sero-labs/orchestrator-catalog.git';

/** Slugs double as directory names, so they must be plain path segments. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Derives a stable cache key from a repo URL ("github-com-acme-loops"), suffixed on collision. */
export function deriveRepoKey(url: string, taken: ReadonlySet<string>): string {
  const slug =
    url
      .replace(/^[a-z+]+:\/\//i, '')
      .replace(/^git@/i, '')
      .replace(/\.git$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'repo';
  if (!taken.has(slug) && slug !== OFFICIAL_CATALOG_KEY) return slug;
  for (let i = 2; ; i += 1) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function isCatalogIndex(value: unknown): value is CatalogIndex {
  return isRecord(value) && value.version === 1 && typeof value.name === 'string' && isStringArray(value.entries);
}

/** Format problems in an entry's curated metadata ([] = valid). */
export function catalogEntryMetaProblems(value: unknown): string[] {
  if (!isRecord(value)) return ['catalog.json is not an object'];
  const problems: string[] = [];
  for (const field of ['slug', 'name', 'description'] as const) {
    if (typeof value[field] !== 'string' || value[field] === '') problems.push(`missing ${field}`);
  }
  if (typeof value.slug === 'string' && value.slug !== '' && !SAFE_SLUG.test(value.slug)) {
    problems.push(`slug must match ${SAFE_SLUG}`);
  }
  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) {
    problems.push('version must be a positive integer');
  }
  for (const field of ['requiredTools', 'connectors'] as const) {
    if (value[field] !== undefined && !isStringArray(value[field])) problems.push(`${field} must be a string array`);
  }
  for (const field of ['recommendedTrigger', 'limitations'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') problems.push(`${field} must be a string`);
  }
  if (value.delivery !== undefined && !isDeliveryDestinationId(value.delivery)) problems.push('unknown delivery destination');
  if (value.costBand !== undefined && !['low', 'medium', 'high'].includes(value.costBand as string)) {
    problems.push('costBand must be low | medium | high');
  }
  if (value.modelTier !== undefined && !['LOW', 'MED', 'HIGH'].includes(value.modelTier as string)) {
    problems.push('modelTier must be LOW | MED | HIGH');
  }
  return problems;
}

export function isCatalogEntryMeta(value: unknown): value is CatalogEntryMeta {
  return catalogEntryMetaProblems(value).length === 0;
}

export interface CatalogInstallPlan {
  entryId: string;
  /** The library version this install resolves to (existing on a reinstall). */
  libraryVersion: number;
  /** Absent ⇒ reinstall no-op: the catalog version is already in the library. */
  write?: { entry: LibraryEntry; version: LibraryVersion };
}

/**
 * Computes how a catalog entry lands in the library (see spec 14, install flow
 * step 3). Provenance-aware, not blind latest+1: a reinstall of an
 * already-installed catalog version is a no-op pointing at the existing
 * library version; a newer catalog version appends the entry's next library
 * version carrying `catalog` provenance. Manual saves interleave untouched
 * (they bump `latestVersion` like always; the entry's `catalog` marker keeps
 * resolving reinstalls).
 */
export function buildCatalogInstall(params: {
  catalogEntry: CatalogEntry;
  /** The library entry already owning this (repoKey, slug), or null. */
  existing: LibraryEntry | null;
  /** Entry id to mint when `existing` is null. */
  newEntryId: string;
  now: string;
}): CatalogInstallPlan {
  const { catalogEntry, existing, newEntryId, now } = params;
  const { meta } = catalogEntry;
  if (existing?.catalog && existing.catalog.catalogVersion >= meta.version) {
    return { entryId: existing.id, libraryVersion: existing.catalog.libraryVersion };
  }
  const versionNumber = existing ? existing.latestVersion + 1 : 1;
  const marker = { repoKey: catalogEntry.repoKey, slug: meta.slug, catalogVersion: meta.version, libraryVersion: versionNumber };
  const entry: LibraryEntry = existing
    ? { ...existing, summary: meta.description, latestVersion: versionNumber, catalog: marker, updatedAt: now }
    : {
        id: newEntryId,
        name: meta.name,
        summary: meta.description,
        latestVersion: versionNumber,
        catalog: marker,
        createdAt: now,
        updatedAt: now,
      };
  const version: LibraryVersion = {
    version: versionNumber,
    definition: structuredClone(catalogEntry.definition),
    note: `Installed from catalog: ${meta.name} (catalog v${meta.version})`,
    catalog: { repoKey: catalogEntry.repoKey, slug: meta.slug, catalogVersion: meta.version },
    createdAt: now,
  };
  return { entryId: entry.id, libraryVersion: versionNumber, write: { entry, version } };
}
