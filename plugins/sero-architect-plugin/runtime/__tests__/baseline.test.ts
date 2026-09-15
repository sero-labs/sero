/**
 * Baseline records (spec architect-run-observability).
 *
 * These tests check the instrument, not the models. Synthetic data proves the
 * record carries what a real evaluation needs; it is never evidence about
 * efficiency, and the guard that says so is the thing under test.
 */

import { describe, expect, it } from 'vitest';
import {
  baselineEvidenceGap,
  compareBaselines,
  isEfficiencyEvidence,
  type BaselineRecord,
} from '../baseline';

const T0 = '2026-09-14T09:00:00.000Z';

/** An instrumentation check: the numbers are made up on purpose. */
const synthetic = (overrides: Partial<BaselineRecord> = {}): BaselineRecord => ({
  candidate: 'Add a seeded level generator',
  objective: 'implementation-and-independent-review',
  models: [
    { operationId: 'workflow:step-1', model: 'anthropic/sonnet', thinking: 'medium', source: 'project override', revision: 8 },
    { operationId: 'workflow:review', model: 'anthropic/opus', thinking: 'high', source: 'manual step pin' },
  ],
  acceptanceCriteria: ['tests pass at a known commit', 'independent review finds no open finding'],
  cost: { attributableUsd: 1.24, aggregateOnlyUsd: 0.11, coverage: 'call', incomplete: false },
  time: { elapsedMs: 42 * 60_000, activeMs: 31 * 60_000, workerMs: 44 * 60_000, waitMs: 6 * 60_000 },
  counters: { agents: 3, turns: 6, requests: 14, toolCalls: 22, retries: 1, compactions: 0 },
  outcome: 'accepted',
  budgetUsd: 5,
  evidence: 'synthetic',
  recordedAt: T0,
  ...overrides,
});

describe('the baseline record names what an evaluation needs', () => {
  it('carries the candidate, the models, the criteria, the cost coverage and the time', () => {
    const record = synthetic();
    expect(record.candidate).toBeTruthy();
    expect(record.models.map((entry) => entry.model)).toEqual(['anthropic/sonnet', 'anthropic/opus']);
    expect(record.acceptanceCriteria).toHaveLength(2);
    expect(record.cost.coverage).toBe('call');
    expect(record.time.activeMs).toBeLessThan(record.time.elapsedMs);
    expect(record.budgetUsd).toBe(5);
  });

  it('keeps summed worker time separate from active time', () => {
    const record = synthetic();
    // Two workers overlapping: summed worker time exceeds the union.
    expect(record.time.workerMs).toBeGreaterThan(record.time.activeMs);
  });
});

describe('synthetic data is never efficiency evidence', () => {
  it('refuses a synthetic record as evidence', () => {
    expect(isEfficiencyEvidence(synthetic())).toBe(false);
    expect(baselineEvidenceGap(synthetic())).toContain('not evidence about model efficiency');
  });

  it('refuses a live record that did not reach an accepted outcome', () => {
    expect(isEfficiencyEvidence(synthetic({ evidence: 'live', outcome: 'incomplete' }))).toBe(false);
  });

  it('accepts only a live record with an accepted outcome and complete cost', () => {
    const live = synthetic({ evidence: 'live' });
    expect(isEfficiencyEvidence(live)).toBe(true);
    expect(baselineEvidenceGap(live)).toBeNull();
    expect(baselineEvidenceGap(synthetic({ evidence: 'live', cost: { attributableUsd: 1, aggregateOnlyUsd: 0, coverage: 'aggregate', incomplete: true } })))
      .toContain('cost is incomplete');
  });
});

describe('comparison reports what changed and what stayed unknown', () => {
  it('reports deltas when the two runs share an objective and criteria', () => {
    const before = synthetic({ evidence: 'live', cost: { attributableUsd: 2, aggregateOnlyUsd: 0, coverage: 'call', incomplete: false } });
    const after = synthetic({ evidence: 'live', cost: { attributableUsd: 1.5, aggregateOnlyUsd: 0, coverage: 'call', incomplete: false } });
    const comparison = compareBaselines(before, after);
    expect(comparison.comparable).toBe(true);
    expect(comparison.deltas.attributableUsd).toBeCloseTo(-0.5);
    expect(comparison.unknowns).toEqual([]);
  });

  it('refuses to compare across different acceptance criteria', () => {
    const comparison = compareBaselines(synthetic(), synthetic({ acceptanceCriteria: ['something else'] }));
    expect(comparison.comparable).toBe(false);
    expect(comparison.unknowns).toContain('The two records do not share an objective and acceptance criteria.');
  });

  it('marks a synthetic or incomplete comparison as unknown rather than an improvement', () => {
    const comparison = compareBaselines(synthetic(), synthetic({ cost: { attributableUsd: 0.5, aggregateOnlyUsd: 0, coverage: 'call', incomplete: true } }));
    expect(comparison.unknowns).toContain('At least one record is synthetic.');
    expect(comparison.unknowns).toContain('At least one record has incomplete cost coverage.');
  });

  it('marks a comparison unknown when neither record names a model', () => {
    const comparison = compareBaselines(synthetic({ models: [] }), synthetic({ models: [], evidence: 'live' }));
    expect(comparison.unknowns).toContain('At least one record names no model, so a model change cannot be attributed.');
  });
});
