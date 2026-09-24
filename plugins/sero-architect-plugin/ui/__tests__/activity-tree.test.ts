/**
 * The inspector's rows (spec architect-run-observability).
 *
 * A filter keeps and opens the ancestors of what it matched, and the filtered
 * subtotal adds each matched cost once: a match inside another match is
 * already in its ancestor's inclusive cost.
 */

import { describe, expect, it } from 'vitest';
import { buildTree, matchedCost, NO_FILTERS } from '../lib/activity-tree';
import type { TraceRecord } from '../lib/trace';
import { activity, node, T } from './trace-fixture';

const run = activity([
  node('owner', { label: 'Owner', kind: 'owner', group: 'owner', costUsd: 0.04 }),
  node('m1', { label: 'M1 · Grid and movement', kind: 'milestone', costUsd: 0.6, startAt: T(5) }),
  node('m1:plan', { parentId: 'm1', label: 'Workflow plan', costUsd: 0.1, startAt: T(6) }),
  node('m1:evidence', { parentId: 'm1', label: 'Evidence', kind: 'evidence', group: 'evaluation', state: 'failed', costUsd: 0.05, startAt: T(8) }),
  node('res', { label: 'What should the first minute teach?', kind: 'research', group: 'research', costUsd: 0.5, startAt: T(20) }),
]);
const charge = (seq: number, nodeId: string): TraceRecord => ({ seq, at: T(seq), kind: 'usage', costUsd: 0.01, nodeId, label: 'Owner' });

describe('rows', () => {
  it('shows only top-level rows until one is opened, and its charges after its own operations', () => {
    const closed = buildTree(run, [charge(1, 'm1')], new Set(), NO_FILTERS);
    expect(closed.rows.map((row) => row.key)).toEqual(['owner', 'm1', 'res']);
    const open = buildTree(run, [charge(1, 'm1')], new Set(['m1']), NO_FILTERS);
    expect(open.rows.map((row) => row.key)).toEqual(['owner', 'm1', 'm1:plan', 'm1:evidence', 'charge:1', 'res']);
  });

  it('merges the running-total charges of one kind of source into one row and keeps each per-call charge', () => {
    const at = (seq: number, source: string, costUsd: number, coverage: TraceRecord['coverage']): TraceRecord =>
      ({ seq, at: T(seq), kind: 'usage', source, costUsd, coverage, nodeId: 'res' });
    const records = [
      at(21, 'room-planning:research:res', 0.02, 'call'),
      ...[22, 23].map((seq) => at(seq, 'room:room_1', 0.1, 'aggregate')),
      at(24, 'room:room_2', 0.1, 'aggregate'),
      at(25, 'owner:s1', 0.03, 'aggregate'),
    ];
    const rows = buildTree(run, records, new Set(['res']), NO_FILTERS).rows.filter((row) => !row.node);
    expect(rows.map((row) => row.key)).toEqual(['charge:21', 'updates:res:room', 'charge:25']);
    expect(rows[1]!.updates).toMatchObject({ from: T(22), to: T(24), sources: ['room:room_1', 'room:room_2'], records: { length: 3 } });
    expect(rows[1]!.updates!.costUsd).toBeCloseTo(0.3);
  });

  it('keeps and opens the ancestors of a match, dimmed, and hides the rest', () => {
    const tree = buildTree(run, [], new Set(), { ...NO_FILTERS, failuresOnly: true });
    expect(tree.rows.map((row) => [row.key, row.dim])).toEqual([['m1', true], ['m1:evidence', false]]);
  });

  it('matches nothing for a group with no activity', () => {
    expect(buildTree(run, [], new Set(), { ...NO_FILTERS, group: 'repair' }).rows).toEqual([]);
  });
});

describe('the filtered subtotal', () => {
  it('adds a match inside another match once', () => {
    const tree = buildTree(run, [], new Set(), { ...NO_FILTERS, group: 'workflows' });
    // m1 (0.60) already includes its plan (0.10), so the plan is not added again.
    expect(matchedCost(tree)).toBeCloseTo(0.6);
  });

  it('is the owner cost when the Owner chip is on', () => {
    expect(matchedCost(buildTree(run, [], new Set(), { ...NO_FILTERS, group: 'owner' }))).toBeCloseTo(0.04);
  });
});
