/**
 * Legacy records (spec architect-run-observability).
 *
 * A record written before run identity kept an amount, not a trace. The summary
 * carries that amount forward untouched and names what the record cannot
 * support. Nothing is reconstructed, and no gap becomes a zero.
 */

import { describe, expect, it } from 'vitest';
import { summarizeLegacyRecord } from '../trace-summary';

/**
 * Sanitized fixtures derived from the shapes the runtime actually wrote: an
 * amount with a source split, a flag that the accounting is incomplete, the
 * reasons it recorded, and the sessions a later grant replaced.
 */
const legacy = {
  id: 'hollow-depths',
  budget: {
    capUsd: 40,
    spentUsd: 11.4,
    incomplete: true,
    incompleteSources: ['usage before run identity', 'owner session re-granted'],
    sources: { owner: 4.2, research: 3.1, dispatched: 4.1 },
  },
  session: { previousSessions: [{ grantId: 'grant-1', sessionPath: '/sessions/1.jsonl', model: 'anthropic/haiku' }] },
};

describe('a legacy record becomes an honest partial summary', () => {
  it('keeps the recorded amount and its source split unchanged', () => {
    const summary = summarizeLegacyRecord(legacy);
    expect(summary).not.toBeNull();
    expect(summary?.attributableUsd).toBe(11.4);
    expect(summary?.sources).toEqual({ owner: 4.2, research: 3.1, dispatched: 4.1 });
    // The split still adds up to the amount the record kept.
    expect(summary!.sources.owner + summary!.sources.research + summary!.sources.dispatched).toBeCloseTo(11.4);
  });

  it('labels the whole amount as aggregate instead of inventing the calls behind it', () => {
    const summary = summarizeLegacyRecord(legacy);
    expect(summary?.aggregateUsd).toBe(11.4);
    expect(summary?.hasAggregate).toBe(true);
    // A total with no call detail is incomplete by construction.
    expect(summary?.incomplete).toBe(true);
  });

  it('carries forward every gap the record named', () => {
    const summary = summarizeLegacyRecord(legacy);
    expect(summary?.incompleteSources).toEqual(['usage before run identity', 'owner session re-granted']);
    // Measurements this record shape cannot support are named, not zeroed.
    expect(summary?.unavailable).toEqual(['timing', 'per-call-cost', 'cache-split', 'run-attribution']);
  });

  it('counts replaced owner sessions without charging them again', () => {
    const summary = summarizeLegacyRecord(legacy);
    // The earlier session's charges are already inside the recorded total.
    expect(summary?.previousSessions).toBe(1);
    expect(summary?.attributableUsd).toBe(11.4);
  });

  it('handles a record that named no reasons, without claiming completeness', () => {
    const summary = summarizeLegacyRecord({
      ...legacy,
      budget: { ...legacy.budget, incompleteSources: undefined },
    });
    expect(summary?.incompleteSources).toEqual([]);
    expect(summary?.incomplete).toBe(true);
  });

  it('reads an unpriced or zero-spend record without turning unknown into zero coverage', () => {
    const summary = summarizeLegacyRecord({
      ...legacy,
      budget: { capUsd: null, spentUsd: 0, incomplete: true, sources: { owner: 0, research: 0, dispatched: 0 } },
    });
    expect(summary?.attributableUsd).toBe(0);
    // Zero spend with no call detail is still unknown coverage, not a measured zero.
    expect(summary?.hasAggregate).toBe(true);
    expect(summary?.unavailable).toContain('per-call-cost');
  });

  it('declines a record that already carries runs, so its journal is used instead', () => {
    expect(summarizeLegacyRecord({ ...legacy, runs: [{ id: 'run-initial' }] })).toBeNull();
  });
});
