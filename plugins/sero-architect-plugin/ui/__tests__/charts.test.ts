/**
 * Inspector aggregations (spec architect-run-observability).
 *
 * The figures a chart draws have to be the figures the runtime reported, and the
 * ways a chart can quietly lie are countable: double-counting a parent, passing a
 * filtered slice off as a run total, and drawing an unmeasured value as zero.
 */

import { describe, expect, it } from 'vitest';
import {
  activityBreakdown, attributableCost, breakdown, cumulativeSpend, exclusiveCost, inclusiveCost,
  modelBreakdown, sharedCost,
} from '../lib/charts';
import type { TraceRecord } from '../lib/trace';

const at = (offsetMs: number): string => new Date(Date.parse('2026-09-14T09:00:00.000Z') + offsetMs).toISOString();
const record = (seq: number, overrides: Partial<TraceRecord> = {}): TraceRecord => ({
  seq, at: at(seq * 1000), kind: 'observation', ...overrides,
});

describe('cumulative spend', () => {
  it('adds only the records that reported a cost', () => {
    const points = cumulativeSpend([
      record(0, { costUsd: 0.1 }),
      record(1),
      record(2, { costUsd: 0.2 }),
    ]);
    expect(points.map((point) => point.cumulativeUsd)).toEqual([0.1, 0.30000000000000004]);
    // Three records, two priced: the line has two points, not three with a flat step.
    expect(points).toHaveLength(2);
  });

  it('orders by time, so a re-read cannot draw the line backwards', () => {
    const points = cumulativeSpend([
      record(2, { costUsd: 0.2, at: at(2000) }),
      record(0, { costUsd: 0.1, at: at(0) }),
    ]);
    expect(points.map((point) => point.cumulativeUsd)).toEqual([0.1, 0.30000000000000004]);
  });

  it('is empty when nothing was priced, which is not the same as zero spend', () => {
    expect(cumulativeSpend([record(0), record(1)])).toEqual([]);
  });
});

describe('breakdowns', () => {
  const records = [
    record(0, { operationKind: 'workflow', costUsd: 0.30 }),
    record(1, { operationKind: 'workflow', costUsd: 0.10 }),
    record(2, { operationKind: 'evidence', costUsd: 0.05 }),
    record(3, { operationKind: 'research' }),
  ];

  it('totals by activity, largest first, and counts the records', () => {
    expect(activityBreakdown(records)).toEqual([
      { activity: 'workflow', costUsd: 0.4, records: 2 },
      { activity: 'evidence', costUsd: 0.05, records: 1 },
      { activity: 'research', costUsd: 0, records: 1 },
    ]);
  });

  it('keeps the model and the thinking level together, because they are one decision', () => {
    const models = modelBreakdown([
      record(0, { model: 'openai-codex/gpt-5.6-terra', thinking: 'high', costUsd: 0.2 }),
      record(1, { model: 'openai-codex/gpt-5.6-terra', thinking: 'low', costUsd: 0.1 }),
      record(2, { model: 'openai-codex/gpt-5.6-terra', thinking: 'high', costUsd: 0.3 }),
    ]);
    expect(models).toEqual([
      { model: 'openai-codex/gpt-5.6-terra', thinking: 'high', costUsd: 0.5, calls: 2 },
      { model: 'openai-codex/gpt-5.6-terra', thinking: 'low', costUsd: 0.1, calls: 1 },
    ]);
  });

  it('names a record that reported no model rather than dropping its cost', () => {
    expect(modelBreakdown([record(0, { costUsd: 0.25 })])).toEqual([
      { model: 'not recorded', thinking: 'not recorded', costUsd: 0.25, calls: 1 },
    ]);
  });

  it('says whether it covers the whole run or a filtered view of it', () => {
    expect(breakdown(records, records.length).filtered).toBe(false);
    const filtered = breakdown(records.slice(0, 2), records.length);
    expect(filtered.filtered).toBe(true);
    // The slice total is the slice's own, not the run's.
    expect(filtered.totals).toEqual([{ activity: 'workflow', costUsd: 0.4, records: 2 }]);
  });
});

describe('inclusive and exclusive cost', () => {
  const tree = [
    record(0, { operationId: 'op_root', costUsd: 0.1 }),
    record(1, { operationId: 'op_child', parentOperationId: 'op_root', costUsd: 0.2 }),
    record(2, { operationId: 'op_grandchild', parentOperationId: 'op_child', costUsd: 0.3 }),
    record(3, { operationId: 'op_elsewhere', costUsd: 5 }),
  ];

  it('separates what an operation spent from what it and its descendants spent', () => {
    expect(exclusiveCost(tree[0]!, tree)).toBeCloseTo(0.1);
    expect(inclusiveCost(tree[0]!, tree)).toBeCloseTo(0.6);
    expect(inclusiveCost(tree[1]!, tree)).toBeCloseTo(0.5);
    expect(inclusiveCost(tree[2]!, tree)).toBeCloseTo(0.3);
  });

  it('counts each cost once when the whole tree is summed', () => {
    // Adding every inclusive figure would count the child twice and the
    // grandchild three times. Summing the exclusive figures is the run total.
    const exclusiveTotal = tree.reduce((total, entry) => total + exclusiveCost(entry, tree), 0);
    expect(exclusiveTotal).toBeCloseTo(5.6);
    expect(inclusiveCost(tree[0]!, tree)).toBeLessThan(exclusiveTotal);
  });

  it('does not follow a parent link that would revisit an operation', () => {
    const loop = [
      record(0, { operationId: 'a', parentOperationId: 'b', costUsd: 1 }),
      record(1, { operationId: 'b', parentOperationId: 'a', costUsd: 2 }),
    ];
    // Terminates, and counts each of the two once.
    expect(inclusiveCost(loop[0]!, loop)).toBeCloseTo(3);
  });
});

describe('shared and attributable cost', () => {
  const records = [
    record(0, { kind: 'usage', costUsd: 0.4 }),
    record(1, { kind: 'shared', costUsd: 0.6 }),
  ];

  it('reports shared activity beside the run figure, never inside it', () => {
    expect(sharedCost(records)).toBeCloseTo(0.6);
    expect(attributableCost(records)).toBeCloseTo(0.4);
  });

  it('is zero for each when there is none, so the two do not leak into each other', () => {
    expect(sharedCost([record(0, { kind: 'usage', costUsd: 1 })])).toBe(0);
    expect(attributableCost([record(0, { kind: 'shared', costUsd: 1 })])).toBe(0);
  });
});
