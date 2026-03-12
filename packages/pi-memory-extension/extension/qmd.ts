/**
 * QMD integration — library-based search using @tobilu/qmd v2 SDK.
 *
 * QMD provides BM25 keyword, vector semantic, and hybrid search over
 * markdown files. As of v2, we use the SDK directly (createStore)
 * rather than shelling out to the CLI.
 *
 * Graceful degradation: if QMD cannot initialise, all functions
 * return safe defaults (false, empty string, etc.).
 */

import { homedir } from 'os';
import { join } from 'path';

import { createStore } from '@tobilu/qmd';
import type { QMDStore, SearchResult, HybridQueryResult } from '@tobilu/qmd';

/** Compute the QMD db path the same way the CLI does, without requiring enableProductionMode(). */
function resolveQmdDbPath(): string {
  const cacheDir = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return join(cacheDir, 'qmd', 'index.sqlite');
}

import { resolveMemoryRoot } from './memory-manager';
import { getResultPath, getResultText } from '../shared/types';
import type { QmdSearchResult } from '../shared/types';
// Re-export so consumers can import from './qmd'
export type { QmdSearchResult } from '../shared/types';

// ── State ──────────────────────────────────────────────────────

let store: QMDStore | null = null;
let qmdAvailable = false;
let updateTimer: ReturnType<typeof setTimeout> | null = null;

const QMD_COLLECTION = 'sero-memory';
const SEARCH_TIMEOUT_MS = 3_000;
const UPDATE_DEBOUNCE_MS = 500;

// ── Detection / availability ──────────────────────────────────

export function isQmdAvailable(): boolean {
  return qmdAvailable;
}

// ── Result mapping ────────────────────────────────────────────

/** Map a QMD SearchResult to our normalised QmdSearchResult shape. */
function mapSearchResult(r: SearchResult): QmdSearchResult {
  return {
    path: r.displayPath ?? r.filepath,
    file: r.filepath,
    score: r.score,
    content: r.body,
  };
}

/** Map a QMD HybridQueryResult to our normalised QmdSearchResult shape. */
function mapHybridResult(r: HybridQueryResult): QmdSearchResult {
  return {
    path: r.displayPath ?? r.file,
    file: r.file,
    score: r.score,
    content: r.bestChunk || r.body,
    snippet: r.bestChunk,
  };
}

// ── Collection management ─────────────────────────────────────

async function ensureCollection(): Promise<boolean> {
  if (!store) return false;

  try {
    const collections = await store.listCollections();
    const hasCollection = collections.some((c) => c.name === QMD_COLLECTION);

    if (hasCollection) return true;

    // Create collection pointing to the memory root
    const root = resolveMemoryRoot();
    await store.addCollection(QMD_COLLECTION, {
      path: root,
      pattern: '**/*.md',
    });

    // Add path contexts (best-effort)
    const contexts: [string, string][] = [
      ['/memory/daily', 'Daily append-only work logs organised by date'],
      ['/', 'Curated long-term memory: decisions, preferences, facts, lessons'],
    ];
    for (const [ctxPath, desc] of contexts) {
      try {
        await store.addContext(QMD_COLLECTION, ctxPath, desc);
      } catch { /* context may already exist */ }
    }

    return true;
  } catch {
    return false;
  }
}

// ── Initialisation (called on session_start) ──────────────────

export async function initQmd(): Promise<boolean> {
  try {
    const dbPath = resolveQmdDbPath();
    store = await createStore({ dbPath });
    qmdAvailable = true;
  } catch {
    qmdAvailable = false;
    return false;
  }

  // Ensure collection exists
  await ensureCollection();
  return true;
}

// ── Search ────────────────────────────────────────────────────

export type QmdSearchMode = 'keyword' | 'semantic' | 'deep';

export async function runSearch(
  mode: QmdSearchMode,
  query: string,
  limit: number,
): Promise<{ results: QmdSearchResult[]; needsEmbed: boolean }> {
  if (!store) return { results: [], needsEmbed: false };

  let needsEmbed = false;

  try {
    if (mode === 'keyword') {
      const raw = await store.searchLex(query, { collection: QMD_COLLECTION, limit });
      return { results: raw.map(mapSearchResult), needsEmbed: false };
    }

    if (mode === 'semantic') {
      const raw = await store.searchVector(query, { collection: QMD_COLLECTION, limit });
      return { results: raw.map(mapSearchResult), needsEmbed: false };
    }

    // deep — hybrid with reranking
    const raw = await store.search({
      query,
      collection: QMD_COLLECTION,
      limit,
    });
    return { results: raw.map(mapHybridResult), needsEmbed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/embed/i.test(msg)) {
      needsEmbed = true;
    }
    return { results: [], needsEmbed };
  }
}

/**
 * Search for memories relevant to a user prompt.
 * Used for selective injection (before_agent_start).
 * Returns formatted markdown or empty string on error.
 */
export async function searchRelevantMemories(prompt: string): Promise<string> {
  if (!qmdAvailable || !prompt.trim()) return '';

  const sanitised = prompt
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 200);
  if (!sanitised) return '';

  try {
    const hasCol = await ensureCollection();
    if (!hasCol) return '';

    let timeoutId: ReturnType<typeof setTimeout>;
    const { results } = await Promise.race([
      runSearch('keyword', sanitised, 3).finally(() => clearTimeout(timeoutId)),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), SEARCH_TIMEOUT_MS);
      }),
    ]);

    if (!results || results.length === 0) return '';

    const snippets = results
      .map((r) => {
        const text = getResultText(r);
        if (!text.trim()) return null;
        const filePath = getResultPath(r);
        const filePart = filePath ? `_${filePath}_` : '';
        return filePart ? `${filePart}\n${text.trim()}` : text.trim();
      })
      .filter(Boolean);

    if (snippets.length === 0) return '';
    return snippets.join('\n\n---\n\n');
  } catch {
    return '';
  }
}

// ── Re-indexing (debounced) ───────────────────────────────────

export function scheduleQmdUpdate(): void {
  if (!qmdAvailable || !store) return;
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    updateTimer = null;
    try {
      await store!.update({ collections: [QMD_COLLECTION] });
    } catch { /* best-effort */ }
  }, UPDATE_DEBOUNCE_MS);
}

export async function runQmdUpdateNow(): Promise<void> {
  if (!qmdAvailable || !store) return;
  try {
    await store.update({ collections: [QMD_COLLECTION] });
  } catch { /* best-effort */ }
}

export function clearUpdateTimer(): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
}
