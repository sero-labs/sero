import { describe, expect, it } from 'vitest';
import { reconcileAll, reconcileLoop } from '../reconcile';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop, sequentialPlan } from './fixtures';
import type { Loop, LoopRun, LoopTrigger, StepAttempt } from '../../shared/types';

/** Adds an enabled cron trigger so the loop counts as recurring. */
function recurring(loop: Loop): Loop {
  const trigger: LoopTrigger = {
    id: 't', loopId: loop.id, workspaceId: loop.workspaceId, type: 'cron',
    schedule: '0 * * * *', fireCount: 1, nextFireAt: '2026-01-01T01:00:00.000Z',
  };
  return { ...loop, triggers: [trigger] };
}

function withInFlightRun(loop: Loop): Loop {
  const attempt: StepAttempt = {
    id: 'att-1', stepId: 'step-1', attemptNumber: 1, parentSessionId: loop.runtime.parentSessionId,
    executionType: 'background-agent', status: 'running', observations: [], startedAt: 't',
  };
  const run: LoopRun = {
    id: 'run-1', runNumber: 1, status: 'running', startedStepIds: ['step-1'], stepAttempts: [attempt],
    recoveryDecisions: [], observations: [], startedAt: 't',
  };
  return {
    ...loop,
    runs: [run],
    runtime: {
      ...loop.runtime,
      activeRunId: 'run-1',
      stepStates: { ...loop.runtime.stepStates, 'step-1': { status: 'running', attempts: 1, updatedAt: 't' } },
    },
  };
}

describe('reconcileLoop', () => {
  it('leaves loops with no active run untouched', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    expect(reconcileLoop(host, loop)).toBe(loop);
  });

  it('marks orphaned runs, attempts, and step states on restart', () => {
    const host = createFakeHost();
    const loop = withInFlightRun(seedActiveLoop(host, oneStepPlan().plan));
    const reconciled = reconcileLoop(host, loop);

    expect(reconciled.runs[0].status).toBe('orphaned');
    expect(reconciled.runs[0].stepAttempts[0].status).toBe('orphaned');
    expect(reconciled.runtime.stepStates['step-1'].status).toBe('failed');
    expect(reconciled.runtime.activeRunId).toBeUndefined();
    expect(reconciled.runs[0].observations.some((o) => o.source === 'system')).toBe(true);
  });

  it('keeps the loop active so it can continue through recovery', () => {
    const host = createFakeHost();
    const loop = withInFlightRun(seedActiveLoop(host, oneStepPlan().plan));
    expect(reconcileLoop(host, loop).status).toBe('active');
  });

  it('re-arms a recurring loop with an orphaned active run', () => {
    const host = createFakeHost();
    const loop = recurring(withInFlightRun(seedActiveLoop(host, oneStepPlan().plan)));
    const reconciled = reconcileLoop(host, loop);
    expect(reconciled.runs[0].status).toBe('orphaned');
    expect(reconciled.runtime.stepStates['step-1'].status).toBe('pending'); // re-armed, not stuck/failed
    expect(reconciled.runtime.activeRunId).toBeUndefined();
    expect(reconciled.status).toBe('active');
  });

  it('unwedges a recurring loop with a step stuck running but no active run', () => {
    const host = createFakeHost();
    const loop = recurring(seedActiveLoop(host, sequentialPlan().plan));
    // step a finished, step b stuck 'running', activeRunId already cleared.
    loop.runtime.stepStates = {
      a: { status: 'succeeded', attempts: 1, updatedAt: 't' },
      b: { status: 'running', attempts: 1, updatedAt: 't' },
    };
    loop.runs = [{ id: 'r', runNumber: 1, status: 'running', startedStepIds: ['a', 'b'], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't', endedAt: 't' }];
    const reconciled = reconcileLoop(host, loop);
    expect(reconciled.runtime.stepStates['a'].status).toBe('pending'); // re-armed for a clean pass
    expect(reconciled.runtime.stepStates['b'].status).toBe('pending');
    expect(reconciled.runs[0].status).toBe('orphaned'); // stale 'running' zombie cleaned up
  });

  it('marks a stuck step failed on a one-off loop even without a recorded attempt', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan); // no trigger → one-off
    loop.runtime.stepStates['step-1'] = { status: 'running', attempts: 1, updatedAt: 't' };
    const reconciled = reconcileLoop(host, loop);
    expect(reconciled.runtime.stepStates['step-1'].status).toBe('failed');
  });
});

describe('reconcileAll', () => {
  it('reconciles every loop in state', async () => {
    const host = createFakeHost();
    const loop = withInFlightRun(seedActiveLoop(host, oneStepPlan().plan));
    host.state = { ...host.state, loops: [loop] };
    await reconcileAll(host);
    expect(host.state.loops[0].runtime.activeRunId).toBeUndefined();
    expect(host.state.loops[0].runs[0].status).toBe('orphaned');
  });
});
