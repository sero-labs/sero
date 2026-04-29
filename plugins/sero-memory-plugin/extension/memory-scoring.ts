/**
 * Memory Strength & Recency Scoring (§3.3).
 *
 * Scores memory entries by access frequency × recency decay.
 * Metadata lives in a sidecar JSON outside the git-tracked workspace
 * to avoid noisy diffs from normal reads.
 *
 * Path: ~/.sero-ui/state/memory/entry-stats.json
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { MemoryEntry } from './memory-format';

// ── Types ──────────────────────────────────────────────────────

export interface EntryStats {
  hits: number;
  last: string; // ISO timestamp
}

type StatsMap = Record<string, EntryStats>;

// ── Constants ──────────────────────────────────────────────────

/** Exponential decay rate — half-life ≈ 14 days. */
const DECAY_RATE = 0.05;

/** Debounce window for flushing stats to disk (ms). */
const FLUSH_DEBOUNCE_MS = 5_000;

// ── State ──────────────────────────────────────────────────────

let stats: StatsMap | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

// ── Path ───────────────────────────────────────────────────────

function resolveStatsPath(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'state', 'memory', 'entry-stats.json');
}

// ── I/O ────────────────────────────────────────────────────────

async function loadStats(): Promise<StatsMap> {
  if (stats) return stats;
  try {
    const raw = await fs.readFile(resolveStatsPath(), 'utf8');
    const parsed = JSON.parse(raw) as StatsMap;
    stats = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    stats = {};
  }
  return stats;
}

async function flushStats(): Promise<void> {
  if (!stats || !dirty) return;
  const filePath = resolveStatsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(stats, null, 2), 'utf8');
  dirty = false;
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushStats().catch(() => {}); }, FLUSH_DEBOUNCE_MS);
}

// ── Scoring ────────────────────────────────────────────────────

/**
 * Compute the injection priority score for an entry.
 * Higher is better. Returns 0 for entries with no recorded stats.
 */
export function entryScore(hits: number, lastAccess: Date): number {
  const daysSince = (Date.now() - lastAccess.getTime()) / 86_400_000;
  const recency = Math.exp(-DECAY_RATE * daysSince);
  return hits * recency;
}

/**
 * Record a hit for one or more entry IDs.
 * Call when entries appear in QMD search results consumed by injection,
 * or when the agent reads MEMORY.md via the `memory read` tool.
 */
export async function recordHits(entryIds: string[]): Promise<void> {
  const map = await loadStats();
  const now = new Date().toISOString();
  for (const id of entryIds) {
    const existing = map[id];
    if (existing) {
      existing.hits += 1;
      existing.last = now;
    } else {
      map[id] = { hits: 1, last: now };
    }
  }
  dirty = true;
  scheduleFlush();
}

/**
 * Sort memory entries by score descending.
 * Entries without stats are placed after scored entries (score = 0).
 */
export async function sortByScore(entries: MemoryEntry[]): Promise<MemoryEntry[]> {
  const map = await loadStats();
  return [...entries].sort((a, b) => {
    const sa = map[a.id];
    const sb = map[b.id];
    const scoreA = sa ? entryScore(sa.hits, new Date(sa.last)) : 0;
    const scoreB = sb ? entryScore(sb.hits, new Date(sb.last)) : 0;
    return scoreB - scoreA;
  });
}

/** Force-flush pending stats (called on session shutdown). */
export async function flushPendingStats(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  await flushStats();
}

/** Prune stats for entry IDs that no longer exist in memory. */
export async function pruneOrphanedStats(liveIds: Set<string>): Promise<void> {
  const map = await loadStats();
  let pruned = 0;
  for (const id of Object.keys(map)) {
    if (!liveIds.has(id)) {
      delete map[id];
      pruned++;
    }
  }
  if (pruned > 0) {
    dirty = true;
    scheduleFlush();
  }
}
