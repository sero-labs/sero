import { describe, expect, it } from 'vitest';
import { appendTracePage, type TracePage, type TraceRecord } from '../lib/trace';

const record = (seq: number): TraceRecord => ({ seq, at: `2026-09-15T10:00:${String(seq).padStart(2, '0')}.000Z`, kind: 'observation' });
const page = (seqs: number[], nextAfterSeq: number | null): TracePage => ({
  recorded: true,
  summary: { attributableUsd: 0, aggregateUsd: 0, hasAggregate: false, incomplete: false, requests: 0, toolCalls: 0, retries: 0, compactions: 0, errors: 0 },
  timing: { activeMs: 0, workerMs: 0, waitMs: 0, openWaits: [] },
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, unavailable: [] },
  records: seqs.map(record),
  nextAfterSeq,
  incomplete: false,
});

describe('appendTracePage', () => {
  it('keeps each record once and continues from the furthest one held', () => {
    // Pages one and two were loaded; a budget change re-reads page one.
    const held = appendTracePage(page([1, 2], 2), page([3, 4], 4));
    const merged = appendTracePage(held, page([1, 2], 2));
    expect(merged.records.map((entry) => entry.seq)).toEqual([1, 2, 3, 4]);
    expect(merged.nextAfterSeq).toBe(4);
  });

  it('reopens pagination when a run read to its end has grown since', () => {
    const complete = appendTracePage(page([1, 2], 2), page([3], null));
    expect(complete.nextAfterSeq).toBeNull();
    const grown = appendTracePage(complete, page([1, 2], 2));
    expect(grown.nextAfterSeq).toBe(3);
  });

  it('stays at the end when the fresh answer says there is no more', () => {
    expect(appendTracePage(page([1, 2], 2), page([3], null)).nextAfterSeq).toBeNull();
  });
});
