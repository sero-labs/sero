/**
 * Speculative retrieval cache (§2.2).
 *
 * Stores prior-turn retrieval results and a topic fingerprint per session.
 * The current prompt always gets its own search — the cache is merged into
 * the candidate set only when topic overlap is meaningful.
 *
 * Lifecycle:
 *   1. before_agent_start — search current prompt; merge cache if topics overlap
 *   2. agent_end          — store turn results + fingerprint
 *   3. session_shutdown   — clear
 */

import type { RankedMemoryResult } from './retrieval';

// ── Topic fingerprint ──────────────────────────────────────────

export interface TopicFingerprint {
  /** Top tokens extracted from the prompt (lowercased, stop-words removed). */
  tokens: Set<string>;
}

export interface CachedRetrieval {
  prompt: string;
  results: RankedMemoryResult[];
  fingerprint: TopicFingerprint;
  timestamp: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'did', 'do', 'for',
  'from', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or',
  'our', 'should', 'that', 'the', 'their', 'them', 'there', 'this', 'to',
  'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'with', 'would', 'you', 'your',
]);

/** Jaccard threshold — below this the cache is ignored on topic shift. */
const OVERLAP_THRESHOLD = 0.25;

/** Maximum age of a cached entry before it's discarded (5 minutes). */
const MAX_AGE_MS = 5 * 60 * 1000;

// ── Session-scoped store ───────────────────────────────────────

const cache = new Map<string, CachedRetrieval>();

// ── Public API ─────────────────────────────────────────────────

export function buildFingerprint(prompt: string): TopicFingerprint {
  const tokens = new Set(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
  );
  return { tokens };
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Store results + fingerprint for the current turn.
 * Called after agent_end so the *next* turn can reuse them.
 */
export function storeTurnResults(
  sessionId: string,
  prompt: string,
  results: RankedMemoryResult[],
  fingerprint: TopicFingerprint,
): void {
  cache.set(sessionId, {
    prompt,
    results,
    fingerprint,
    timestamp: Date.now(),
  });
}

/**
 * Retrieve cached results from the previous turn.
 * Returns `null` on first turn, cache miss, or stale entry.
 */
export function consumeCache(sessionId: string): CachedRetrieval | null {
  const entry = cache.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > MAX_AGE_MS) {
    cache.delete(sessionId);
    return null;
  }
  return entry;
}

/**
 * Merge cached results into fresh results when topic overlap is sufficient.
 * Returns the union set, deduped by result key, with fresh results preferred.
 */
export function mergeCachedResults(
  freshResults: RankedMemoryResult[],
  cached: CachedRetrieval,
  currentFingerprint: TopicFingerprint,
  limit: number,
): RankedMemoryResult[] {
  const overlap = jaccardOverlap(currentFingerprint.tokens, cached.fingerprint.tokens);
  if (overlap < OVERLAP_THRESHOLD) return freshResults;

  // Dedupe: fresh results take priority
  const seen = new Set(freshResults.map((r) => resultKey(r)));
  const merged = [...freshResults];
  for (const cachedResult of cached.results) {
    if (merged.length >= limit) break;
    const key = resultKey(cachedResult);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cachedResult);
  }

  return merged.slice(0, limit);
}

/** Clear cache for a session (called on shutdown). */
export function clearCache(sessionId: string): void {
  cache.delete(sessionId);
}

// ── Internal ───────────────────────────────────────────────────

function resultKey(r: RankedMemoryResult): string {
  const path = r.normalizedPath ?? '';
  const text = (r.content ?? r.snippet ?? r.chunk ?? '')
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${path}::${text}`;
}
