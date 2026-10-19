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
  outcomeFromChecks,
  type BaselineControlledInputs,
  type BaselineRecord,
  type BaselineStrategy,
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

const inputs = (overrides: Partial<BaselineControlledInputs> = {}): BaselineControlledInputs => ({
  request: 'Fix the off-by-one in the pager',
  workspaceFingerprint: 'sha256:aaa',
  acceptanceRevision: 'checks-1',
  model: 'provider/model',
  thinking: 'medium',
  capabilities: ['edit', 'read', 'shell'],
  budgetUsd: 2,
  budgetMinutes: 30,
  requiresIndependentReview: false,
  ...overrides,
});

/** A live run of one strategy, with everything a controlled comparison needs. */
const run = (strategy: BaselineStrategy, overrides: Partial<BaselineRecord> = {}): BaselineRecord => synthetic({
  objective: 'small-fix',
  evidence: 'live',
  run: { runId: `${strategy}-1`, strategy, revision: 'abc123', replicate: 1 },
  inputs: inputs(),
  checks: [{ id: 'tests', passed: true }],
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
  it('reports deltas when two distinct runs held the same inputs', () => {
    const before = run('architect', { cost: { attributableUsd: 2, aggregateOnlyUsd: 0, coverage: 'call', incomplete: false } });
    const after = run('persistent-single-agent', { cost: { attributableUsd: 1.5, aggregateOnlyUsd: 0, coverage: 'call', incomplete: false } });
    const comparison = compareBaselines(before, after);
    expect(comparison.comparable).toBe(true);
    expect(comparison.deltas.attributableUsd).toBeCloseTo(-0.5);
    expect(comparison.unknowns).toEqual([]);
  });

  it('refuses to compare a run with itself', () => {
    const record = run('architect');
    expect(compareBaselines(record, record).comparable).toBe(false);
    // A copy read back from disk is still the same run.
    expect(compareBaselines(record, structuredClone(record)).comparable).toBe(false);
  });

  it('names the controlled inputs that differ instead of crediting the strategy', () => {
    const comparison = compareBaselines(
      run('architect'),
      run('persistent-single-agent', { inputs: inputs({ model: 'provider/other', budgetUsd: 5 }) }),
    );
    expect(comparison.comparable).toBe(false);
    expect(comparison.mismatches).toEqual(['model', 'budgetUsd']);
  });

  it('cannot claim a strategy effect when a delegate ran an unrecorded model', () => {
    const comparison = compareBaselines(
      run('architect', { models: [{ operationId: 'workflow:step-1', source: 'workflow' }] }),
      run('persistent-single-agent'),
    );
    expect(comparison.unknowns.join(' ')).toContain('no recorded model or effort');
  });

  it('does not count a rescued run as unassisted', () => {
    const rescued = run('architect', { interventions: [{ kind: 'state-repair', note: 'unstuck the record', at: T0 }] });
    expect(baselineEvidenceGap(rescued)).toContain('intervention');
    expect(compareBaselines(rescued, run('persistent-single-agent')).unknowns.join(' ')).toContain('intervention');
  });

  it('leaves a record saved before run identities unattributable', () => {
    const legacy = synthetic({ evidence: 'live' });
    const comparison = compareBaselines(legacy, synthetic({ evidence: 'live', recordedAt: '2026-09-15T09:00:00.000Z' }));
    expect(comparison.unknowns.join(' ')).toContain('no run identity or controlled inputs');
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

describe('an outcome comes from the task checks alone', () => {
  it('keeps a finished run with no checks unaccepted', () => {
    // Direct work has no dispatch to fail, so "no failure" must accept nothing.
    expect(outcomeFromChecks([], true)).toBe('incomplete');
    expect(outcomeFromChecks([{ id: 'tests', passed: null }], true)).toBe('incomplete');
  });

  it('rejects on one failed check and accepts only when every check passed', () => {
    expect(outcomeFromChecks([{ id: 'tests', passed: true }, { id: 'review', passed: false }], true)).toBe('rejected');
    expect(outcomeFromChecks([{ id: 'tests', passed: true }], true)).toBe('accepted');
  });

  it('keeps an unfinished run incomplete even when its checks pass', () => {
    expect(outcomeFromChecks([{ id: 'tests', passed: true }], false)).toBe('incomplete');
  });
});
