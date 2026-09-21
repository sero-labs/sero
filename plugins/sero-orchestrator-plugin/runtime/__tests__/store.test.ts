import { describe, expect, it } from 'vitest';
import { buildIndex, buildRunIndex, composeState, diffRuns, diffState, stripLoopForPersist, toRunSummary, toSummary } from '../store';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type {
  Loop,
  LoopBlock,
  LoopRun,
  LoopRunSummary,
  RunIndex,
  StepActivation,
  StepActivationStatus,
  StepAttemptStatus,
} from '../../shared/types';

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

describe('board enrichment (Agent Board index view)', () => {
  it('embeds usage roll-up, activity, model, branch, checkout, and PR chips', () => {
    const host = createFakeHost();
    const plan = oneStepPlan().plan;
    const base = seedActiveLoop(host, plan, 'loop-a');
    const stepId = plan.steps[0].id;
    const usedRun: LoopRun = {
      ...run('r1'),
      stepAttempts: [
        { ...run('r1').stepAttempts[0], model: 'claude-sonnet-5', usage: { inputTokens: 100, outputTokens: 40, costUsd: 0.02 } },
      ],
    };
    const loop: Loop = {
      ...base,
      runs: [usedRun, { ...run('r2'), stepAttempts: [{ ...run('r2').stepAttempts[0], usage: { inputTokens: 10, outputTokens: 5 } }] }],
      runtime: {
        ...base.runtime,
        activeRunId: 'r2',
        lastRunAt: '2026-07-18T11:00:00Z',
        stepStates: { ...base.runtime.stepStates, [stepId]: { status: 'running', attempts: 1, updatedAt: 't' } },
        workspace: {
          resolved: {
            id: 'ctx', type: 'managed-worktree', workspaceRoot: '/ws', cwd: '/ws/.sero/worktrees/loop-a',
            worktreePath: '/ws/.sero/worktrees/loop-a', branchName: 'sero/loop-a', resolvedBy: 'create-option', createdAt: 't',
          },
        },
        pullRequests: [
          { number: 7, url: 'https://github.com/o/r/pull/7', title: 'Fix', headRefName: 'sero/loop-a', updatedAt: 't' },
        ],
      },
    };
    const summary = toSummary(loop);
    expect(summary.usage).toEqual({ inputTokens: 110, outputTokens: 45, costUsd: 0.02 });
    expect(summary.activeStepTitles).toEqual([plan.steps[0].title]);
    expect(summary.lastModel).toBe('claude-sonnet-5');
    expect(summary.branchName).toBe('sero/loop-a');
    expect(summary.checkoutPath).toBe('/ws/.sero/worktrees/loop-a');
    expect(summary.pullRequests).toEqual([{ number: 7, url: 'https://github.com/o/r/pull/7', title: 'Fix' }]);
    expect(summary.lastRunAt).toBe('2026-07-18T11:00:00Z');
  });

  it('omits every board field when the loop has no runs or workspace context', () => {
    const host = createFakeHost();
    const summary = toSummary(seedActiveLoop(host, oneStepPlan().plan, 'loop-a'));
    expect(summary.usage).toBeUndefined();
    expect(summary.activeStepTitles).toBeUndefined();
    expect(summary.lastModel).toBeUndefined();
    expect(summary.branchName).toBeUndefined();
    expect(summary.pullRequests).toBeUndefined();
  });
});

describe('run summary retains why a run ended', () => {
  const limitBlock: LoopBlock = {
    kind: 'management-limit',
    reason: 'reached max cost ($1.2)',
    createdAt: '2026-07-18T10:00:00.000Z',
    sourceStepId: 's1',
    sourceAttemptId: 'a-s1',
    limit: 'maxCostUsd',
  };

  function activation(
    id: string,
    stepId: string,
    status: StepActivationStatus,
    visitNumber = 1,
  ): StepActivation {
    return { id, stepId, visitNumber, status, attemptIds: [], startedAt: 't' };
  }

  function attempt(id: string, stepId: string, activationId: string, status: StepAttemptStatus) {
    return {
      id,
      stepId,
      activationId,
      attemptNumber: 1,
      parentSessionId: 'p',
      executionType: 'background-agent' as const,
      status,
      observations: [],
      startedAt: 't',
    };
  }

  it('retains the block with every field the management-limit type carries', () => {
    const settled: LoopRun = {
      ...run('r1'),
      status: 'blocked',
      block: limitBlock,
      stepActivations: [activation('act-1', 's1', 'succeeded')],
    };
    expect(toRunSummary(settled).block).toEqual(limitBlock);
  });

  it('retains no block and no interrupted step for a run that completed', () => {
    const summary = toRunSummary(run('r1'));
    expect(summary.block).toBeUndefined();
    expect(summary.interruptedStepIds).toBeUndefined();
  });

  it('names every step a restart left in flight, not only one', () => {
    const interrupted: LoopRun = {
      ...run('r1'),
      status: 'orphaned',
      stepActivations: [
        activation('act-1', 's1', 'orphaned'),
        activation('act-2', 's2', 'succeeded'),
        activation('act-3', 's3', 'orphaned'),
      ],
    };
    expect(toRunSummary(interrupted).interruptedStepIds).toEqual(['s1', 's3']);
  });

  it('reports an interrupted step as interrupted beside an untouched step\'s own outcome', () => {
    const interrupted: LoopRun = {
      ...run('r1'),
      status: 'orphaned',
      stepAttempts: [attempt('a1', 's1', 'act-1', 'completed'), attempt('a2', 's2', 'act-2', 'failed')],
      stepActivations: [activation('act-1', 's1', 'orphaned'), activation('act-2', 's2', 'failed')],
    };
    const summary = toRunSummary(interrupted);
    expect(summary.steps.map((s) => [s.stepId, s.status])).toEqual([
      ['s1', 'orphaned'],
      ['s2', 'failed'],
    ]);
    expect(summary.interruptedStepIds).toEqual(['s1']);
  });

  it('reads an orphaned activation with no attempts as interrupted, not completed', () => {
    const interrupted: LoopRun = {
      ...run('r1'),
      status: 'orphaned',
      stepAttempts: [],
      stepActivations: [activation('act-1', 's1', 'orphaned')],
    };
    expect(toRunSummary(interrupted).steps[0].status).toBe('orphaned');
  });

  it('round-trips the block and the interrupted steps through the run index', () => {
    const index = buildRunIndex([
      { ...run('r1'), status: 'blocked', block: limitBlock, stepActivations: [activation('act-1', 's1', 'orphaned')] },
    ]);
    const restored = JSON.parse(JSON.stringify(index)) as RunIndex;
    expect(restored).toEqual(index);
    expect(restored.runs[0].block).toEqual(limitBlock);
    expect(restored.runs[0].interruptedStepIds).toEqual(['s1']);
  });

  it('loads a summary written before the block and interrupted fields existed', () => {
    // Exactly the shape runs/index.json held before this change.
    const earlier: LoopRunSummary = {
      id: 'run_1',
      runNumber: 1,
      status: 'orphaned',
      startedAt: 't',
      steps: [{ stepId: 's1', attemptNumber: 1, executionType: 'background-agent', status: 'completed' }],
      recoveries: [],
    };
    const loaded = JSON.parse(JSON.stringify(earlier)) as LoopRunSummary;
    expect(loaded).toEqual(earlier);
    expect(loaded.block).toBeUndefined();
    expect(loaded.interruptedStepIds).toBeUndefined();
  });

  it('does not infer an interrupted step from a run that kept no activations', () => {
    const earlier: LoopRun = {
      ...run('r1'),
      status: 'orphaned',
      stepAttempts: [{ ...run('r1').stepAttempts[0], status: 'orphaned' }],
    };
    const summary = toRunSummary(earlier);
    expect(summary.interruptedStepIds).toBeUndefined();
    expect(summary.block).toBeUndefined();
  });

  it('records each step\'s position in the PLAN, which is not its place in the run', () => {
    const interrupted: LoopRun = {
      ...run('r1'),
      status: 'orphaned',
      stepActivations: [activation('act-1', 'choose', 'succeeded'), activation('act-2', 'right', 'orphaned')],
    };
    // The plan is [choose, left, right] and the run skipped `left`, so the
    // interrupted step is the third even though it is the second activation.
    const index = buildRunIndex([interrupted], ['choose', 'left', 'right']);
    expect(index.runs[0].steps.map((step) => [step.stepId, step.planIndex]))
      .toEqual([['choose', 0], ['right', 2]]);
    expect(index.runs[0].interruptedStepIds).toEqual(['right']);
  });

  it('leaves the plan position absent when the writer did not know the plan', () => {
    const summary = toRunSummary({
      ...run('r1'),
      status: 'orphaned',
      stepActivations: [activation('act-1', 's1', 'orphaned')],
    });
    // No plan to read, so no position is claimed. A reader must then state no
    // step number rather than infer one from the run's own order.
    expect(summary.steps[0].planIndex).toBeUndefined();
    expect(summary.interruptedStepIds).toEqual(['s1']);
  });
});
