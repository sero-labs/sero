/**
 * Inspector run states (spec architect-run-observability).
 *
 * Every state carries a word, and two pairs must not collapse into each other:
 * an interrupted run is not an active one, and a partial history is not an empty
 * one. Getting those wrong is how a view reports a confident number it does not
 * have.
 */

import { describe, expect, it } from 'vitest';
import { describeRunState, type RunStateInput } from '../lib/run-state';
import type { TracePage, TraceRecord } from '../lib/trace';

const at = (offsetMs: number): string => new Date(Date.parse('2026-09-14T09:00:00.000Z') + offsetMs).toISOString();
const record = (seq: number, overrides: Partial<TraceRecord> = {}): TraceRecord => ({
  seq, at: at(seq * 1000), kind: 'observation', ...overrides,
});

const page = (records: TraceRecord[], overrides: Partial<TracePage> = {}): TracePage => ({
  summary: {
    attributableUsd: 0.1, aggregateUsd: 0, hasAggregate: false, incomplete: false,
    requests: 1, toolCalls: 0, retries: 0, compactions: 0, errors: 0,
  },
  timing: { activeMs: 1000, workerMs: 0, waitMs: 0 },
  tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, unavailable: [] },
  records,
  nextAfterSeq: null,
  incomplete: false,
  ...overrides,
});

const input = (overrides: Partial<RunStateInput> = {}): RunStateInput => ({
  loading: false,
  answered: true,
  page: page([record(0)]),
  runOpen: false,
  projectHalted: false,
  range: null,
  visibleRecords: 1,
  ...overrides,
});

describe('the state a view is in', () => {
  it('reports loading until an answer arrives, not an empty view', () => {
    const state = describeRunState(input({ loading: true, answered: false, page: null, visibleRecords: 0 }));
    expect(state.state).toBe('loading');
    expect(state.label).toBe('Loading');
  });

  it('reports nothing recorded when nothing was ever reported', () => {
    const state = describeRunState(input({ page: page([]), visibleRecords: 0 }));
    expect(state.state).toBe('empty');
    // The detail says why this is not the same as zero: the two causes look alike.
    expect(state.detail).toContain('telemetry failed');
  });

  it('reports active when the view is open and has reported nothing yet', () => {
    const state = describeRunState(input({ page: page([]), runOpen: true, visibleRecords: 0 }));
    expect(state.state).toBe('active');
  });

  it('reports waiting only from an observed cause', () => {
    const waited = describeRunState(input({
      page: page([record(0, { operationKind: 'wait', waitCause: 'approval' })], { timing: { activeMs: 0, workerMs: 0, waitMs: 5000 } }),
      runOpen: true,
      visibleRecords: 1,
    }));
    expect(waited.state).toBe('waiting');
    expect(waited.detail).toContain('approval');
    expect(waited.detail).toContain('observed intervals only');
  });

  it('does not infer waiting from elapsed time alone', () => {
    const state = describeRunState(input({
      page: page([record(0)], { timing: { activeMs: 1, workerMs: 1, waitMs: 0 } }),
      runOpen: true,
      visibleRecords: 1,
    }));
    expect(state.state).not.toBe('waiting');
  });

  it('reports failed with the count, not only a colour', () => {
    const state = describeRunState(input({
      page: page([record(0, { outcome: 'failed' })], {
        summary: { ...page([]).summary, errors: 2 },
      }),
    }));
    expect(state.state).toBe('failed');
    expect(state.detail).toContain('2 operations');
  });

  it('reports interrupted when the project stopped and the run never ended', () => {
    const state = describeRunState(input({ runOpen: true, projectHalted: true }));
    expect(state.state).toBe('interrupted');
    // Late activity still belongs here rather than being hidden as settled.
    expect(state.detail).toContain('Late activity');
  });

  it('does not call an open run interrupted while the project is running', () => {
    const state = describeRunState(input({ runOpen: true, projectHalted: false, visibleRecords: 1 }));
    expect(state.state).not.toBe('interrupted');
  });

  it('reports a partial history rather than an empty one', () => {
    const state = describeRunState(input({ page: page([record(0)], { incomplete: true }) }));
    expect(state.state).toBe('incomplete');
    expect(state.detail).toContain('lower bound');
  });

  it('reports a partial history when the summary itself was bounded', () => {
    const bounded = page([record(0)], { summary: { ...page([]).summary, incomplete: true } });
    expect(describeRunState(input({ page: bounded })).state).toBe('incomplete');
  });

  it('says a zoomed range is empty rather than calling the view empty', () => {
    const state = describeRunState(input({ range: { from: 0, to: 1 }, visibleRecords: 0 }));
    expect(state.state).toBe('empty');
    expect(state.label).toBe('Nothing in this range');
  });

  it('reports complete when everything reported is shown', () => {
    const state = describeRunState(input());
    expect(state.state).toBe('settled');
    expect(state.label).toBe('Complete');
  });

  it('gives every state a label, so no status depends on colour', () => {
    const cases: RunStateInput[] = [
      input({ loading: true, answered: false, page: null, visibleRecords: 0 }),
      input({ page: page([]), visibleRecords: 0 }),
      input({ page: page([]), runOpen: true, visibleRecords: 0 }),
      input({ runOpen: true, projectHalted: true }),
      input({ page: page([record(0)], { incomplete: true }) }),
      input(),
    ];
    for (const testCase of cases) {
      const state = describeRunState(testCase);
      expect(state.label.length).toBeGreaterThan(0);
      expect(state.detail.length).toBeGreaterThan(0);
    }
  });
});
