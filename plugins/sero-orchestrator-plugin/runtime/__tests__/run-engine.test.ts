import { describe, expect, it } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { StepOutcome } from '../../shared/types';
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
});
