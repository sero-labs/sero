import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeDecider, fakeExecutor, gatedExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };

function coordinatorWith(host: FakeHost, partial: Partial<EngineDeps>): Coordinator {
  const deps: EngineDeps = {
    executor: partial.executor ?? fakeExecutor({}),
    decider: partial.decider ?? fakeDecider({ decision: 'wait' }),
    locks: partial.locks ?? new LoopLocks(),
  };
  return new Coordinator(host, deps);
}

describe('Coordinator core (Phase 3)', () => {
  it('run_next drives a coordinator run through the engine', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const coordinator = coordinatorWith(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });
    const res = await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('two concurrent run_next requests run each step once', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const { executor, release } = gatedExecutor(SUCCESS);
    const coordinator = coordinatorWith(host, { executor });
    const a = coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const b = coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    release();
    await Promise.all([a, b]);
    expect(executor.calls).toEqual(['step-1']);
  });

  it('blocks the loop with a clear reason on invalid runtime state', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    delete loop.runtime.stepStates['step-1'];
    host.state = { ...host.state, loops: [loop] };
    const coordinator = coordinatorWith(host, {});
    await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const blocked = host.state.loops[0];
    expect(blocked.status).toBe('blocked');
    expect(blocked.runtime.block?.kind).toBe('runtime-error');
    expect(blocked.runtime.block?.reason).toContain('missing runtime state');
  });
});
