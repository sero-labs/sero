/**
 * Per-file scan cache: parsing is the expensive part of a refresh, so
 * files whose { mtimeMs, size } fingerprint is unchanged reuse their
 * previously parsed compact records. Aggregation always re-runs globally
 * because dedup is cross-file (docs/specs/sero-usage-plugin-spec.md §3.4).
 */

import { promises as fs } from 'node:fs';

import type { ParsedSession } from './scan';
import { parseSessionFile } from './scan';
import { writeJsonFile } from './state-io';

export const CACHE_SCHEMA_VERSION = 1;

interface CacheEntry {
  mtimeMs: number;
  size: number;
  /** null = file parsed but had no usable session header. */
  session: ParsedSession | null;
}

export interface ScanCache {
  schemaVersion: number;
  files: Record<string, CacheEntry>;
}

export function emptyScanCache(): ScanCache {
  return { schemaVersion: CACHE_SCHEMA_VERSION, files: {} };
}

/** Missing, corrupt, or version-mismatched cache → start empty and rescan. */
export async function loadScanCache(filePath: string): Promise<ScanCache> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ScanCache;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      parsed.schemaVersion === CACHE_SCHEMA_VERSION &&
      typeof parsed.files === 'object' &&
      parsed.files !== null
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return emptyScanCache();
}

export async function saveScanCache(filePath: string, cache: ScanCache): Promise<void> {
  await writeJsonFile(filePath, cache);
}

export interface ScanResult {
  sessions: ParsedSession[];
  /** Next cache — deleted files already dropped. */
  cache: ScanCache;
  files: number;
  reused: number;
}

/**
 * Parse every file in `sessionFiles`, reusing cached results for unchanged
 * fingerprints. Input order is preserved so downstream dedup stays
 * deterministic.
 */
export async function scanWithCache(sessionFiles: string[], cache: ScanCache): Promise<ScanResult> {
  const nextCache = emptyScanCache();
  const sessions: ParsedSession[] = [];
  let reused = 0;

  for (const filePath of sessionFiles) {
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      continue; // deleted between listing and stat
    }

    const cached = cache.files[filePath];
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      nextCache.files[filePath] = cached;
      if (cached.session) sessions.push(cached.session);
      reused++;
      continue;
    }

    const session = await parseSessionFile(filePath);
    nextCache.files[filePath] = { mtimeMs: stats.mtimeMs, size: stats.size, session };
    if (session) sessions.push(session);
  }

  return { sessions, cache: nextCache, files: sessionFiles.length, reused };
}
