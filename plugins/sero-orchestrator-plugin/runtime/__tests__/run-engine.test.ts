import { describe, expect, it } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import type { EngineDeps, StepExecutor } from '../engine-types';
import type { LoopPlan, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, parallelPlan, sequentialPlan, seedActiveLoop } from './fixtures';
import { artifactExecutor, fakeDecider, fakeExecutor, gatedExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'done' };

function deps(partial: Partial<EngineDeps>): EngineDeps {
  return {
    executor: partial.executor ?? fakeExecutor({}),
    decider: partial.decider ?? fakeDecider({ decision: 'wait' }),
    locks: partial.locks ?? new LoopLocks(),
    evaluator: partial.evaluator,
    workspaceResolver: partial.workspaceResolver,
  };
}

function loopOf(host: FakeHost, id = 'loop-1') {
  return host.state.loops.find((l) => l.id === id)!;
}

describe('RunEngine', () => {
  it('runs a one-step plan to success and records the attempt', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const executor = fakeExecutor({ 'step-1': SUCCESS });
    const engine = new RunEngine(host, deps({ executor }));

    const result = await engine.run('loop-1');
    expect(result.acquired).toBe(true);
    const loop = loopOf(host);
    expect(loop.runtime.stepStates['step-1'].status).toBe('succeeded');
    expect(loop.runs[0].stepAttempts).toHaveLength(1);
    expect(loop.runtime.activeRunId).toBeUndefined();
  });

  it('reconciles the loop\'s open PRs by branch match at run start', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.pullRequests = [
      { number: 1, url: 'u1', title: 'mine', headRefName: 'fix/x-loop-1', updatedAt: 't' },
      { number: 2, url: 'u2', title: 'other loop', headRefName: 'fix/y-loop-2', updatedAt: 't' },
    ];
    await new RunEngine(host, deps({ executor: fakeExecutor({ 'step-1': SUCCESS }) })).run('loop-1');
    const prs = loopOf(host).runtime.pullRequests ?? [];
    expect(prs.map((p) => p.number)).toEqual([1]);
  });

  it('runs sequential steps in dependency order', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan);
    const executor = fakeExecutor({ a: SUCCESS, b: SUCCESS });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    expect(executor.calls).toEqual(['a', 'b']);
    const loop = loopOf(host);
    expect(loop.runtime.stepStates.b.status).toBe('succeeded');
  });

  it('starts independent ready steps in parallel up to maxConcurrentSteps', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, parallelPlan().plan);
    const executor = fakeExecutor({ root: SUCCESS, left: SUCCESS, right: SUCCESS, join: SUCCESS });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    // root first, then left+right together, then join.
    expect(executor.calls[0]).toBe('root');
    expect(executor.calls.slice(1, 3).sort()).toEqual(['left', 'right']);
    expect(executor.calls[3]).toBe('join');
  });

  it('two concurrent runs produce at most one coordinator run that does work', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const { executor, release } = gatedExecutor(SUCCESS);
    const engine = new RunEngine(host, deps({ executor }));

    const a = engine.run('loop-1');
    const b = engine.run('loop-1');
    release();
    await Promise.all([a, b]);

    expect(executor.calls).toEqual(['step-1']); // step executed exactly once
    const runsWithWork = loopOf(host).runs.filter((r) => r.startedStepIds.length > 0);
    expect(runsWithWork).toHaveLength(1);
  });

  it('completes the loop only on a planned completion signal', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const completing: StepOutcome = { status: 'succeeded', summary: 'validated', completion: { status: 'complete', reason: 'all good' } };
    await new RunEngine(host, deps({ executor: fakeExecutor({ 'step-1': completing }) })).run('loop-1');
    const loop = loopOf(host);
    expect(loop.status).toBe('complete');
    expect(loop.runtime.completion?.status).toBe('complete');
  });

  it('does not complete when all steps succeed without a completion signal', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    await new RunEngine(host, deps({ executor: fakeExecutor({ 'step-1': SUCCESS }) })).run('loop-1');
    expect(loopOf(host).status).toBe('active');
  });

  it('blocks the loop when recovery decides block-loop', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const failed: StepOutcome = { status: 'failed', summary: 'boom' };
    const engine = new RunEngine(host, deps({
      executor: fakeExecutor({ 'step-1': failed }),
      decider: fakeDecider({ decision: 'block-loop', reason: 'unrecoverable' }),
    }));
    await engine.run('loop-1');
    const loop = loopOf(host);
    expect(loop.status).toBe('blocked');
    expect(loop.runtime.block?.kind).toBe('recovery-block');
  });

  it('retries a failed step when recovery decides retry-step', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    let calls = 0;
    const executor = fakeExecutor({
      'step-1': () => {
        calls += 1;
        return calls === 1 ? { status: 'failed', summary: 'first fails' } : SUCCESS;
      },
    });
    const engine = new RunEngine(host, deps({ executor, decider: fakeDecider({ decision: 'retry-step' }) }));
    await engine.run('loop-1');
    expect(calls).toBe(2);
    expect(loopOf(host).runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('stores large output as an artifact referenced from the attempt', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.logPolicy.maxInlineOutputBytes = 4; // force artifact use in the executor path
    host.state = { ...host.state, loops: [loop] };
    const big = 'x'.repeat(5000);
    const engine = new RunEngine(host, deps({ executor: artifactExecutor(big, SUCCESS) }));
    await engine.run('loop-1');
    const attempt = loopOf(host).runs[0].stepAttempts[0];
    expect(attempt.outputPath).toBeTruthy();
    expect(await host.readArtifact(attempt.outputPath!)).toBe(big);
  });

  it('does not run a disabled loop', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.status = 'disabled';
    host.state = { ...host.state, loops: [loop] };
    const result = await new RunEngine(host, deps({})).run('loop-1');
    expect(result.acquired).toBe(false);
  });

  it('resets in-flight steps to pending when a run is cancelled mid-batch', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const { executor, release } = gatedExecutor(SUCCESS);
    const controller = new AbortController();
    const runPromise = new RunEngine(host, deps({ executor })).run('loop-1', controller.signal);

    // Wait until the engine has committed the step as running and entered the
    // (gated) executor — i.e. we are mid-batch.
    await waitFor(() => executor.calls.length === 1);
    expect(loopOf(host).runtime.stepStates['step-1'].status).toBe('running');

    // A disable would abort here, then mark the loop disabled.
    controller.abort();
    release();
    const result = await runPromise;

    expect(result.run?.status).toBe('cancelled');
    const loop = loopOf(host);
    // The step is back to pending (not left stuck at 'running'), so re-enabling
    // and running again picks it up without an app restart.
    expect(loop.runtime.stepStates['step-1'].status).toBe('pending');
    expect(loop.runtime.activeRunId).toBeUndefined();
  });

  it('numbers runs by a monotonic counter that survives run-history pruning', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.logPolicy.retainRuns = 1; // prune to a single run after each pass
    host.state = { ...host.state, loops: [loop] };
    const engine = new RunEngine(host, deps({ executor: fakeExecutor({ 'step-1': SUCCESS }) }));

    await engine.run('loop-1');
    await engine.run('loop-1');
    const after = loopOf(host);
    expect(after.runs).toHaveLength(1); // pruned
    expect(after.runtime.runSeq).toBe(2); // but the counter kept climbing
    expect(after.runs[0].runNumber).toBe(2);
  });
});

/** Polls until `cond` holds (or fails after a bounded number of macrotasks). */
async function waitFor(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('waitFor timed out');
}

describe('RunEngine — agent fallback warning', () => {
  it('records one agent-unavailable warning when a step fell back from its role', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const executor: StepExecutor = {
      async run(input) {
        return {
          id: input.host.newId('attempt'),
          stepId: input.step.id,
          attemptNumber: input.attemptNumber,
          parentSessionId: input.parentSessionId,
          executionType: input.step.execution.type,
          status: 'completed',
          outcome: SUCCESS,
          agentFallback: { requestedAgent: 'ghost' },
          observations: [],
          startedAt: input.host.now(),
          endedAt: input.host.now(),
        };
      },
    };
    await new RunEngine(host, deps({ executor })).run('loop-1');
    const warnings = loopOf(host).warnings.filter((w) => w.code === 'agent-unavailable');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].stepId).toBe('step-1');
    expect(warnings[0].message).toContain('ghost');
  });
});

describe('RunEngine — outcome notifications', () => {
  it('notifies once with an info message when the loop completes', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const completing: StepOutcome = { status: 'succeeded', summary: 'validated', completion: { status: 'complete', reason: 'all good' } };
    await new RunEngine(host, deps({ executor: fakeExecutor({ 'step-1': completing }) })).run('loop-1');
    expect(host.notifications).toEqual([{ message: 'Loop "Seeded" finished.', type: 'info' }]);
  });

  it('notifies once with a warning when the loop blocks', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const engine = new RunEngine(host, deps({
      executor: fakeExecutor({ 'step-1': { status: 'failed', summary: 'boom' } }),
      decider: fakeDecider({ decision: 'block-loop', reason: 'unrecoverable' }),
    }));
    await engine.run('loop-1');
    expect(host.notifications).toEqual([{ message: 'Loop "Seeded" is blocked — unrecoverable.', type: 'warning' }]);
  });

  it('does not notify when a run ends without completing or blocking', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    await new RunEngine(host, deps({ executor: fakeExecutor({ 'step-1': SUCCESS }) })).run('loop-1');
    expect(host.notifications).toEqual([]);
  });
});

describe('RunEngine — branching', () => {
  const branchPlan: LoopPlan = {
    schemaVersion: 1,
    revision: 0,
    objective: 'route the work',
    steps: [
      { id: 'judge', title: 'Judge', instructions: 'decide', execution: { type: 'model' }, produces: ['route'] },
      { id: 'a', title: 'A', instructions: 'do a', execution: { type: 'background-agent' }, dependsOn: ['judge'], when: { var: 'route', in: ['x'] } },
      { id: 'b', title: 'B', instructions: 'do b', execution: { type: 'background-agent' }, dependsOn: ['judge'], when: { var: 'route', in: ['y'] } },
      { id: 'end', title: 'End', instructions: 'finalize', execution: { type: 'model' }, dependsOn: ['a', 'b'] },
    ],
  };

  it('runs the taken branch and never executes the un-taken one', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, branchPlan);
    const executor = fakeExecutor({
      judge: { status: 'succeeded', summary: 'route x', variables: { route: 'x' } },
      a: SUCCESS,
      end: SUCCESS,
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    expect(executor.calls).toContain('a');
    expect(executor.calls).not.toContain('b');
    const loop = loopOf(host);
    expect(loop.runtime.stepStates.a.status).toBe('succeeded');
    expect(loop.runtime.stepStates.b.status).toBe('skipped');
    expect(loop.runtime.stepStates.end.status).toBe('succeeded'); // unguarded convergence ran
  });

  it('on no-match, skips every branch and still runs the unguarded finalize step', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, branchPlan);
    const executor = fakeExecutor({
      judge: { status: 'succeeded', summary: 'route z', variables: { route: 'z' } },
      end: SUCCESS,
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    expect(executor.calls).toEqual(['judge', 'end']); // neither branch executed
    const loop = loopOf(host);
    expect(loop.runtime.stepStates.a.status).toBe('skipped');
    expect(loop.runtime.stepStates.b.status).toBe('skipped');
    expect(loop.runtime.stepStates.end.status).toBe('succeeded');
  });
});
