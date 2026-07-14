import { describe, expect, it } from 'vitest';
import { buildIndex, buildRunIndex, composeState, diffRuns, diffState, stripLoopForPersist, toSummary } from '../store';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { Loop, LoopRun } from '../../shared/types';

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
      progress: { total: 1, done: 0, running: false },
    });
  });

  it('reports step progress (succeeded count + running flag)', () => {
    const host = createFakeHost();
    const plan = oneStepPlan().plan;
    const base = seedActiveLoop(host, plan, 'loop-a');
    const stepId = plan.steps[0].id;
    const loop: Loop = {
      ...base,
      runtime: {
        ...base.runtime,
        activeRunId: 'run_1',
        stepStates: { ...base.runtime.stepStates, [stepId]: { status: 'succeeded', attempts: 1, updatedAt: 't' } },
      },
    };
    expect(toSummary(loop).progress).toEqual({ total: 1, done: 1, running: true });
  });

  it('omits the attention payload when nothing needs the user', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    expect(toSummary(loop).attention).toBeUndefined();
  });

  it('embeds pending input + suggestions as the index attention payload', () => {
    const host = createFakeHost();
    const base = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    const loop: Loop = {
      ...base,
      runtime: {
        ...base.runtime,
        pendingInput: { id: 'in_1', source: 'planner', questions: [{ id: 'q1', prompt: 'Which repo?' }], askedAt: 't' },
      },
      suggestions: [
        { id: 'sg_1', createdAt: 't', target: 'plan', rationale: 'Tighten step 2', confidence: 'high', proposedPlan: base.plan, changedStepIds: ['s'], status: 'pending' },
        { id: 'sg_2', createdAt: 't', target: 'plan', rationale: 'already decided', confidence: 'low', proposedPlan: base.plan, changedStepIds: [], status: 'approved' },
      ],
    };
    const summary = toSummary(loop);
    expect(summary.pendingInput).toBe(1);
    expect(summary.pendingSuggestions).toBe(1); // only the pending one counts
    expect(summary.attention?.input).toEqual({ requestId: 'in_1', source: 'planner', questions: [{ id: 'q1', prompt: 'Which repo?' }] });
    expect(summary.attention?.suggestions).toEqual([{ id: 'sg_1', rationale: 'Tighten step 2', confidence: 'high', changedStepCount: 1 }]);
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

  it('keeps skipped and snoozed disposition details in the run index', () => {
    const snoozed = {
      ...run('r1'),
      status: 'snoozed' as const,
      statusReason: 'User snoozed the run.',
      retryAt: '2026-07-14T09:00:00.000Z',
    };
    expect(buildRunIndex([snoozed]).runs[0]).toMatchObject({
      status: 'snoozed',
      statusReason: 'User snoozed the run.',
      retryAt: '2026-07-14T09:00:00.000Z',
    });
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

describe('schedule summaries (cross-plugin index view)', () => {
  it('embeds cron/hybrid triggers with a schedule and skips event/manual triggers', () => {
    const host = createFakeHost();
    const base = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    const loop: Loop = {
      ...base,
      triggers: [
        { id: 'tc', loopId: 'loop-a', workspaceId: 'ws-1', type: 'cron', schedule: '0 9 * * *', fireCount: 2, nextFireAt: 'n', lastFireAt: 'l' },
        { id: 'th', loopId: 'loop-a', workspaceId: 'ws-1', type: 'hybrid', schedule: '0 8 * * 1', fireCount: 0, scheduleDisabled: true },
        { id: 'tx', loopId: 'loop-a', workspaceId: 'ws-1', type: 'cron', schedule: '0 7 * * *', fireCount: 3, maxFires: 3, disabled: true },
        { id: 'te', loopId: 'loop-a', workspaceId: 'ws-1', type: 'event', eventSource: 'fs:changed', fireCount: 0 },
        { id: 'tm', loopId: 'loop-a', workspaceId: 'ws-1', type: 'manual', fireCount: 0 },
      ],
    };
    expect(toSummary(loop).schedules).toEqual([
      { triggerId: 'tc', type: 'cron', schedule: '0 9 * * *', nextFireAt: 'n', lastFireAt: 'l', paused: undefined, exhausted: undefined },
      { triggerId: 'th', type: 'hybrid', schedule: '0 8 * * 1', nextFireAt: undefined, lastFireAt: undefined, paused: true, exhausted: undefined },
      { triggerId: 'tx', type: 'cron', schedule: '0 7 * * *', nextFireAt: undefined, lastFireAt: undefined, paused: undefined, exhausted: true },
    ]);
  });

  it('omits schedules entirely for unscheduled loops (index stays small)', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    expect(toSummary(loop).schedules).toBeUndefined();
  });
});
