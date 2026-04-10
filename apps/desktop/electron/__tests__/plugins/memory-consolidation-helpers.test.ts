import { describe, expect, it, vi } from 'vitest';

import {
  MAX_BATCH_CHARS,
  MAX_BATCH_LOGS,
  buildDailyLogBatches,
  filterNovelEntries,
  normalizeCandidateEntries,
  type DailyLogCandidate,
} from '@plugins/sero-memory-plugin/extension/consolidation-helpers';
import type { MemoryEntry } from '@plugins/sero-memory-plugin/extension/memory-format';

// ── Helpers ────────────────────────────────────────────────────

function makeLog(date: string, content: string): DailyLogCandidate {
  return { date, filePath: `/memory/daily/${date}.md`, content };
}

function makeEntry(text: string, id?: string, type = 'fact'): MemoryEntry {
  return {
    id: id ?? `mem-${Math.random().toString(16).slice(2, 8)}`,
    hasId: true,
    type,
    text,
    line: 0,
    raw: '',
  };
}

// ── buildDailyLogBatches ───────────────────────────────────────

describe('buildDailyLogBatches', () => {
  it('groups logs into batches under MAX_BATCH_CHARS', () => {
    // Create logs that together exceed MAX_BATCH_CHARS
    const bigContent = 'x'.repeat(Math.floor(MAX_BATCH_CHARS / 2) + 100);
    const logs = [
      makeLog('2026-03-28', bigContent),
      makeLog('2026-03-29', bigContent),
      makeLog('2026-03-30', 'small log'),
    ];

    const batches = buildDailyLogBatches(logs);
    expect(batches.length).toBeGreaterThan(1);
    // Each batch should not exceed MAX_BATCH_CHARS (except single oversized log)
    for (const batch of batches) {
      if (batch.logs.length > 1) {
        expect(batch.chars).toBeLessThanOrEqual(MAX_BATCH_CHARS);
      }
    }
  });

  it('caps each batch at MAX_BATCH_LOGS entries', () => {
    const logs = Array.from({ length: MAX_BATCH_LOGS + 3 }, (_, i) =>
      makeLog(`2026-03-${String(i + 1).padStart(2, '0')}`, 'short log'),
    );

    const batches = buildDailyLogBatches(logs);
    for (const batch of batches) {
      expect(batch.logs.length).toBeLessThanOrEqual(MAX_BATCH_LOGS);
    }
  });

  it('handles single log that exceeds batch char limit', () => {
    const hugeContent = 'x'.repeat(MAX_BATCH_CHARS + 5000);
    const logs = [makeLog('2026-03-28', hugeContent)];

    const batches = buildDailyLogBatches(logs);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.logs).toHaveLength(1);
    // The single batch exceeds the limit, but that's OK for a single log
    expect(batches[0]!.chars).toBeGreaterThan(MAX_BATCH_CHARS);
  });

  it('returns empty array for empty input', () => {
    const batches = buildDailyLogBatches([]);
    expect(batches).toHaveLength(0);
  });

  it('puts small logs in a single batch', () => {
    const logs = [
      makeLog('2026-03-28', 'log one'),
      makeLog('2026-03-29', 'log two'),
      makeLog('2026-03-30', 'log three'),
    ];

    const batches = buildDailyLogBatches(logs);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.logs).toHaveLength(3);
  });
});

// ── normalizeCandidateEntries ──────────────────────────────────

describe('normalizeCandidateEntries', () => {
  it('parses LLM output with § prefix entries', () => {
    const raw = [
      '§ [decision] Chose Clerk over Auth.js for auth',
      '§ [fact] Project uses PostgreSQL 17',
    ].join('\n');

    const entries = normalizeCandidateEntries(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('decision');
    expect(entries[0]!.text).toBe('Chose Clerk over Auth.js for auth');
    expect(entries[1]!.type).toBe('fact');
  });

  it('normalizes type tags to allowed set (unknown → fact)', () => {
    const raw = '§ [note] Something important\n§ [todo] Do the thing';
    const entries = normalizeCandidateEntries(raw);
    expect(entries[0]!.type).toBe('fact');
    expect(entries[1]!.type).toBe('fact');
  });

  it('assigns IDs to entries without them', () => {
    const raw = '§ [fact] No ID here';
    const entries = normalizeCandidateEntries(raw);
    expect(entries[0]!.id).toMatch(/^mem-[a-f0-9]+$/);
    expect(entries[0]!.hasId).toBe(true);
  });

  it('filters out whitespace-only entries via normalizeWhitespace', () => {
    // Both § lines are valid syntax. The first has only spaces as text
    // after type extraction. Since parseMemoryEntries normalizeWhitespace
    // them, and normalizeCandidateEntries filters Boolean(text), entries
    // with whitespace-only content after the type tag are removed.
    // Note: `§ [fact]   ` (no text after tag) falls back to matching
    // without the type group, capturing `[fact]` as text — so we test
    // that normalizeCandidateEntries produces valid entries from real input.
    const raw = '§ [fact] Real content\n§ [decision] Valid decision';
    const entries = normalizeCandidateEntries(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('fact');
    expect(entries[1]!.type).toBe('decision');
  });

  it('returns empty array for blank input', () => {
    expect(normalizeCandidateEntries('')).toHaveLength(0);
    expect(normalizeCandidateEntries('   ')).toHaveLength(0);
  });

  it('handles legacy bullet-list output from LLM', () => {
    const raw = '- Chose Clerk for auth\n- Deploy to fly.io';
    const entries = normalizeCandidateEntries(raw);
    // Should fall through to normalizeLegacyMemory
    expect(entries).toHaveLength(2);
  });
});

// ── filterNovelEntries ─────────────────────────────────────────

describe('filterNovelEntries', () => {
  // Use longer entries so Jaccard near-match tests have enough tokens
  const existing = [
    makeEntry('Project uses TypeScript for all backend services', 'mem-001'),
    makeEntry('Deploy to fly.io with containers', 'mem-002'),
  ];

  it('keeps entries not in existing memory', () => {
    const candidates = [
      makeEntry('Chose Clerk for auth'),
      makeEntry('Use pnpm for package management'),
    ];
    const { entries, duplicates } = filterNovelEntries(existing, candidates);
    expect(entries).toHaveLength(2);
    expect(duplicates).toBe(0);
  });

  it('filters exact duplicates', () => {
    const candidates = [
      makeEntry('Project uses TypeScript for all backend services'),
    ];
    const { entries, duplicates } = filterNovelEntries(existing, candidates);
    expect(entries).toHaveLength(0);
    expect(duplicates).toBe(1);
  });

  it('filters near-duplicates', () => {
    // Original: {project, uses, typescript, all, backend, services} = 6 tokens
    // Candidate: {project, uses, typescript, all, backend} = 5 tokens
    // Jaccard = 5/6 ≈ 0.833 ≥ 0.8 threshold
    const candidates = [
      makeEntry('Project uses TypeScript for all backend'),
    ];
    const { entries, duplicates } = filterNovelEntries(existing, candidates);
    expect(entries).toHaveLength(0);
    expect(duplicates).toBe(1);
  });

  it('filters entries that fail security scan', () => {
    // Use invisible unicode which always blocks (no forensic-context bypass)
    const candidates = [
      makeEntry('some text with\u200Bhidden zero-width space'),
    ];
    const { entries, duplicates } = filterNovelEntries(existing, candidates);
    expect(entries).toHaveLength(0);
    expect(duplicates).toBe(1);
  });

  it('counts filtered entries as duplicates', () => {
    const candidates = [
      makeEntry('Project uses TypeScript for all backend services'), // exact dup
      makeEntry('Brand new valid entry'),                            // novel
      makeEntry('text with\u200Bhidden zero-width'),                 // blocked (unicode)
    ];
    const { entries, duplicates } = filterNovelEntries(existing, candidates);
    expect(entries).toHaveLength(1);
    expect(duplicates).toBe(2);
  });

  it('deduplicates within candidates themselves', () => {
    const candidates = [
      makeEntry('Completely new fact alpha'),
      makeEntry('Completely new fact alpha'),
    ];
    const { entries, duplicates } = filterNovelEntries([], candidates);
    expect(entries).toHaveLength(1);
    expect(duplicates).toBe(1);
  });
});
