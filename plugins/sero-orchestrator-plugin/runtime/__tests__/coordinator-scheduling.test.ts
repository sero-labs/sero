import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import type { EngineDeps } from '../engine-types';
import type { Loop, LoopTrigger, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeExecutor, gatedExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };
const NOW = '2026-06-22T10:00:00.000Z';

function coordinator(host: FakeHost, overrides: Partial<EngineDeps> = {}): Coordinator {
  return new Coordinator(host, createEngineDeps(new LoopLocks(), overrides));
}

function addTrigger(host: FakeHost, trigger: LoopTrigger): Loop {
  const loop = { ...host.state.loops[0], triggers: [trigger] };
  host.state = { ...host.state, loops: [loop] };
  return loop;
}

describe('Coordinator scheduling (Phase 7)', () => {
  it('runs a cron loop that came due while the workspace was closed', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-06-22T08:00:00.000Z', fireCount: 0 });

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) }).tick();
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
    expect(host.state.loops[0].triggers[0].fireCount).toBe(1); // collapsed to one fire
  });

  it('event triggers run through normal lifecycle (active runs, paused does not)', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'x', fireCount: 0 });

    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });
    await c.fireEvent('loop-1', 'x');
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');

    // Pause and fire again: the trigger marks due but the loop does not run.
    host.state = { ...host.state, loops: [{ ...host.state.loops[0], status: 'paused', runtime: { ...host.state.loops[0].runtime, stepStates: { 'step-1': { status: 'pending', attempts: 0, updatedAt: 't' } } } }] };
    await c.fireEvent('loop-1', 'x');
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('pending');
  });

  it('a trigger during an active run sets runtime.dueAgain instead of a second run', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'x', fireCount: 0 });
    const { executor, release } = gatedExecutor(SUCCESS);
    const c = coordinator(host, { executor });

    const running = c.runNext('loop-1');
    await Promise.resolve(); // let the run acquire the lock and reach the gate
    await new Promise((r) => setTimeout(r, 0));
    await c.fireEvent('loop-1', 'x'); // arrives while the run holds the lock
    expect(host.state.loops[0].runtime.dueAgain).toBe(true);

    release();
    await running;
    expect(executor.calls).toEqual(['step-1']); // still only one execution
  });

  it('a maxFires trigger stops firing after the final allowed fire', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'x', fireCount: 0, maxFires: 1 });
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });

    await c.fireEvent('loop-1', 'x');
    expect(host.state.loops[0].triggers[0].fireCount).toBe(1);
    expect(host.state.loops[0].triggers[0].disabled).toBe(true);

    const before = host.state.loops[0].triggers[0].fireCount;
    await c.fireEvent('loop-1', 'x');
    expect(host.state.loops[0].triggers[0].fireCount).toBe(before); // no further fire
  });
});
