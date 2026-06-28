import { describe, expect, it } from 'vitest';
import { buildIndex, buildRunIndex, composeState, diffRuns, diffState, stripLoopForPersist, toSummary } from '../store';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { LoopRun } from '../../shared/types';

function run(id: string, summary = 'ok'): LoopRun {
  return {
    id,
    runNumber: 1,
    status: 'completed',
    startedStepIds: ['s'],
    stepAttempts: [
      { id: `a-${id}`, stepId: 's', attemptNumber: 1, parentSessionId: 'p', executionType: 'background-agent', status: 'completed', outcome: { status: 'succeeded', summary }, observations: [], startedAt: 't' },
    ],
    recoveryDecisions: [],
    observations: [],
    startedAt: 't',
  };
}

describe('store helpers', () => {
  it('summarizes a loop to the lightweight index fields', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    expect(toSummary(loop)).toEqual({
      id: 'loop-a', title: loop.title, status: loop.status,
      summary: loop.summary, prompt: loop.prompt, createdAt: loop.createdAt, updatedAt: loop.updatedAt,
    });
  });

  it('writes only the loop that changed (reference diff)', () => {
    const host = createFakeHost();
    const a = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    const b = seedActiveLoop(host, oneStepPlan().plan, 'loop-b');
    const prev = composeState([a, b]);
    const next = composeState([{ ...a, status: 'disabled' as const, updatedAt: 'later' }, b]); // b kept by reference
    const diff = diffState(prev, next);
    expect(diff.changed.map((l) => l.id)).toEqual(['loop-a']);
    expect(diff.removedIds).toEqual([]);
    expect(diff.indexChanged).toBe(true); // status/updatedAt are summary fields
  });

  it('does not rewrite the index when only non-summary data changes', () => {
    const host = createFakeHost();
    const a = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    const prev = composeState([a]);
    // Run history changed, but summary fields (incl. updatedAt) are identical.
    const next = composeState([{ ...a, runs: [...a.runs] }]);
    const diff = diffState(prev, next);
    expect(diff.changed.map((l) => l.id)).toEqual(['loop-a']);
    expect(diff.indexChanged).toBe(false);
  });

  it('flags removed loops for deletion', () => {
    const host = createFakeHost();
    const a = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    const b = seedActiveLoop(host, oneStepPlan().plan, 'loop-b');
    const diff = diffState(composeState([a, b]), composeState([a]));
    expect(diff.removedIds).toEqual(['loop-b']);
    expect(diff.indexChanged).toBe(true);
  });

  it('builds an index entry per loop', () => {
    const host = createFakeHost();
    const a = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    const b = seedActiveLoop(host, oneStepPlan().plan, 'loop-b');
    expect(buildIndex(composeState([a, b])).loops.map((l) => l.id)).toEqual(['loop-a', 'loop-b']);
  });
});

describe('run-split helpers', () => {
  it('strips runs and revisions out of the persisted loop', () => {
    const host = createFakeHost();
    const loop = { ...seedActiveLoop(host, oneStepPlan().plan, 'l'), runs: [run('r1')] };
    expect(stripLoopForPersist(loop).runs).toEqual([]);
    expect(stripLoopForPersist(loop).revisions).toEqual([]);
  });

  it('summarizes runs into a compact index', () => {
    const index = buildRunIndex([run('r1')]);
    expect(index.runs[0]).toMatchObject({ id: 'r1', runNumber: 1, status: 'completed' });
    expect(index.runs[0].steps[0]).toMatchObject({ stepId: 's', outcomeStatus: 'succeeded' });
  });

  it('rolls each run\'s attempt usage up into the summary (and omits it when none reported)', () => {
    const withUsage = run('r1');
    withUsage.stepAttempts[0].usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120, durationMs: 900 };
    const index = buildRunIndex([withUsage, run('r2')]);
    expect(index.runs[0].usage).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 120, durationMs: 900 });
    expect(index.runs[1].usage).toBeUndefined(); // r2 reported nothing
  });

  it('diffs runs by value so only the changed run is rewritten (clones are not "changed")', () => {
    const a = run('r1', 'first');
    const b = run('r2', 'second');
    // r1 arrives as a fresh clone (identical content); r2 changed status.
    const diff = diffRuns([a, b], [structuredClone(a), { ...b, status: 'failed' as const }]);
    expect(diff.changed.map((r) => r.id)).toEqual(['r2']);
    expect(diff.removedIds).toEqual([]);
    expect(diff.indexChanged).toBe(true);
  });

  it('flags pruned runs for deletion', () => {
    const diff = diffRuns([run('r1'), run('r2')], [run('r1')]);
    expect(diff.changed).toEqual([]); // r1 is byte-identical
    expect(diff.removedIds).toEqual(['r2']);
    expect(diff.indexChanged).toBe(true);
  });
});
