/**
 * Trace summaries (spec architect-run-observability).
 *
 * The summary is folded from the same deltas the budget charges, so the two
 * reconcile by construction. Timing is a union, never a sum of parallel work,
 * and a counter nothing reported stays unknown rather than becoming zero.
 */

import { describe, expect, it } from 'vitest';
import type { JournalRecord } from '../run-journal';
import {
  configurationProvenance,
  inclusiveCostOf,
  summarizeTiming,
  summarizeTrace,
  tokenComposition,
  type TraceTotals,
} from '../trace-summary';

const T = (minutes: number) => new Date(Date.parse('2026-09-14T09:00:00.000Z') + minutes * 60_000).toISOString();

let sequence = 0;
function record(fields: Partial<JournalRecord> & { kind: JournalRecord['kind'] }): JournalRecord {
  sequence += 1;
  return { v: 1, seq: sequence, at: T(0), ...fields } as JournalRecord;
}

/** A charge: the delta a source reported, which is what the budget also charged. */
const charge = (source: string, costUsd: number, extra: Partial<JournalRecord> = {}) =>
  record({ kind: 'usage', source, costUsd, ...extra });

const start = (operationId: string, at: string, extra: Partial<JournalRecord> = {}) =>
  record({ kind: 'observation', recordKind: 'operation-start', operationId, at, ...extra });

const end = (operationId: string, at: string, extra: Partial<JournalRecord> = {}) =>
  record({ kind: 'observation', recordKind: 'operation-end', operationId, at, ...extra });

describe('cost reconciles with the budget', () => {
  it('sums the deltas and reconciles exactly with known project spend', () => {
    const records = [
      charge('research:a', 0.1),
      charge('research:a', 0.05),
      charge('room-planning:dispatch:m1', 0.2),
      charge('subagent:b', 0.01),
    ];
    const summary = summarizeTrace(records, { projectId: 'p', runId: 'r', knownSpendUsd: 0.36 });
    expect(summary.attributableUsd).toBeCloseTo(0.36);
    expect(summary.reconciliationUsd).toBe(0);
    expect(summary.hasAggregate).toBe(false);
  });

  it('does not double-count a replayed or reordered report of the same delta', () => {
    // A restart re-reads the journal. Deltas are what was charged, so replaying
    // the same records must produce the same total, in any order.
    const records = [charge('a', 0.1), charge('b', 0.2), charge('a', 0.05)];
    const forward = summarizeTrace(records, { projectId: 'p', runId: 'r' });
    const reordered = summarizeTrace([records[2], records[0], records[1]], { projectId: 'p', runId: 'r' });
    expect(forward.attributableUsd).toBeCloseTo(0.35);
    expect(reordered.attributableUsd).toBeCloseTo(forward.attributableUsd);
  });

  it('keeps aggregate-only usage visible instead of dropping or restating it', () => {
    const records = [
      charge('call:1', 0.2, { coverage: 'call' }),
      // A source that reported a total without call detail.
      charge('legacy:planning', 0.8, { coverage: 'aggregate' }),
    ];
    const summary = summarizeTrace(records, { projectId: 'p', runId: 'r' });
    expect(summary.attributableUsd).toBeCloseTo(1.0);
    expect(summary.aggregateUsd).toBeCloseTo(0.8);
    expect(summary.hasAggregate).toBe(true);
  });

  it('counts a failed attempt as cost and as an error', () => {
    const records = [
      charge('attempt:1', 0.03),
      end('attempt:1', T(2), { outcome: 'failed' }),
      charge('attempt:2', 0.04),
      end('attempt:2', T(4), { outcome: 'ok' }),
    ];
    const summary = summarizeTrace(records, { projectId: 'p', runId: 'r' });
    expect(summary.attributableUsd).toBeCloseTo(0.07);
    expect(summary.errors).toBe(1);
  });

  it('marks the run incomplete when an operation never closed', () => {
    const records = [start('workflow', T(0)), start('workflow:step', T(1), { parentOperationId: 'workflow' })];
    const summary = summarizeTrace(records, { projectId: 'p', runId: 'r' });
    expect(summary.incomplete).toBe(true);
  });

  it('reports a parent inclusive cost without rebilling its children', () => {
    const records = [
      charge('step:1', 0.1, { operationId: 'step:1', parentOperationId: 'workflow' }),
      charge('step:2', 0.2, { operationId: 'step:2', parentOperationId: 'workflow' }),
      charge('unrelated', 0.4),
    ];
    // The inclusive value is for inspection only.
    expect(inclusiveCostOf('workflow', records)).toBeCloseTo(0.3);
    // The run total counts the leaves once and never adds the parent again.
    expect(summarizeTrace(records, { projectId: 'p', runId: 'r' }).attributableUsd).toBeCloseTo(0.7);
  });
});

describe('timing counts overlap once', () => {
  it('counts two workers over the same interval as one interval of active time', () => {
    const member = { operationKind: 'room-member' } as const;
    const records = [
      start('member-a', T(0), member), end('member-a', T(10)),
      start('member-b', T(0), member), end('member-b', T(10)),
    ];
    const timing = summarizeTiming(records);
    // Ten minutes elapsed, not twenty: the union, not the sum.
    expect(timing.activeMs).toBe(10 * 60_000);
    // Summed worker time is a different question and is reported separately.
    expect(timing.workerMs).toBe(20 * 60_000);
  });

  it('does not fill a parent interval across its children gaps', () => {
    const records = [
      start('workflow', T(0), { operationKind: 'workflow' }), end('workflow', T(60)),
      start('step-1', T(0), { operationKind: 'workflow-step', parentOperationId: 'workflow' }), end('step-1', T(10)),
      start('step-2', T(50), { operationKind: 'workflow-step', parentOperationId: 'workflow' }), end('step-2', T(60)),
    ];
    // The idle 40 minutes between the steps is not active work.
    expect(summarizeTiming(records).activeMs).toBe(20 * 60_000);
  });

  it('reports waits by their observed cause and never infers one', () => {
    const records = [
      start('wait:approval', T(41), { operationKind: 'wait', waitCause: 'approval' }), end('wait:approval', T(48)),
      start('wait:queue', T(48), { operationKind: 'wait', waitCause: 'queue' }), end('wait:queue', T(49)),
    ];
    const timing = summarizeTiming(records);
    expect(timing.waitMs).toBe(8 * 60_000);
    expect(timing.waitByCause).toEqual({ approval: 7 * 60_000, queue: 1 * 60_000 });
    // A wait is not active work.
    expect(timing.activeMs).toBe(0);
    // Both waits ended, so nothing is waiting now.
    expect(timing.openWaits).toEqual([]);
  });

  it('names only a wait that has started and not ended as open', () => {
    const records = [
      start('wait:approval', T(41), { operationKind: 'wait', waitCause: 'approval' }), end('wait:approval', T(48)),
      start('wait:queue', T(48), { operationKind: 'wait', waitCause: 'queue' }),
    ];
    // The page a reader sees may not hold the end; the folded history does.
    expect(summarizeTiming(records).openWaits).toEqual(['queue']);
  });

  it('leaves an interval nobody closed out of the totals', () => {
    const records = [start('step', T(0))];
    expect(summarizeTiming(records).activeMs).toBe(0);
  });
});

describe('token composition stays disjoint and honest', () => {
  it('normalizes cache categories so they never overlap input', () => {
    const records = [
      charge('a', 0.1, { usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 1000, cacheWriteTokens: 50 } }),
    ];
    expect(tokenComposition(records)).toEqual({ input: 100, output: 20, cacheRead: 1000, cacheWrite: 50, unavailable: [] });
  });

  it('names a counter nothing reported as unavailable rather than zero', () => {
    const records = [charge('a', 0.1, { usage: { inputTokens: 5, outputTokens: 1 } })];
    const composition = tokenComposition(records);
    expect(composition.input).toBe(5);
    expect(composition.unavailable).toEqual(['cacheRead', 'cacheWrite']);
  });

  it('does not add reasoning tokens, which are a subset of output', () => {
    const records = [charge('a', 0.1, { usage: { inputTokens: 1, outputTokens: 500, reasoningTokens: 400 } })];
    expect(tokenComposition(records).output).toBe(500);
  });
});

describe('configuration provenance', () => {
  it('names the model, thinking and source each operation used', () => {
    const records = [
      start('step-1', T(0), { model: 'openai/gpt-codex', thinking: 'high', source: 'project override', configRevision: 8 }),
      start('step-2', T(1), { model: 'anthropic/opus', thinking: 'medium', source: 'manual step pin' }),
    ];
    expect(configurationProvenance(records)).toEqual([
      { operationId: 'step-1', model: 'openai/gpt-codex', thinking: 'high', source: 'project override', revision: 8 },
      { operationId: 'step-2', model: 'anthropic/opus', thinking: 'medium', source: 'manual step pin' },
    ]);
  });

  it('leaves a field absent when the runtime did not record it', () => {
    expect(configurationProvenance([start('step-1', T(0))])).toEqual([{ operationId: 'step-1' }]);
  });
});

describe('summary shape', () => {
  it('returns the empty totals for no records', () => {
    const summary = summarizeTrace([], { projectId: 'p', runId: 'r' });
    const expected: TraceTotals = {
      attributableUsd: 0, aggregateUsd: 0, hasAggregate: false, incomplete: false,
      requests: 0, toolCalls: 0, retries: 0, compactions: 0, errors: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    };
    expect(summary).toEqual({ ...expected, projectId: 'p', runId: 'r', records: 0 });
  });

  it('shows a non-zero reconciliation when the trace and budget disagree', () => {
    const summary = summarizeTrace([charge('a', 0.1)], { projectId: 'p', runId: 'r', knownSpendUsd: 0.25 });
    // The inspector must be able to show the difference rather than hide it.
    expect(summary.reconciliationUsd).toBeCloseTo(-0.15);
  });
});
