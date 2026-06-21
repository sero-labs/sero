import { describe, expect, it } from 'vitest';
import { reconcileAll, reconcileLoop } from '../reconcile';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { Loop, LoopRun, StepAttempt } from '../../shared/types';

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
