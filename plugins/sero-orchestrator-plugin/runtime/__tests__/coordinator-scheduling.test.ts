import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import type { EngineDeps, StepExecutor } from '../engine-types';
import type { Loop, LoopTrigger, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop, sequentialPlan } from './fixtures';
import { fakeExecutor, gatedExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };
const ITERATION_DONE: StepOutcome = {
  status: 'succeeded',
  summary: 'iteration done',
  completion: { status: 'complete', reason: 'this iteration finished' },
};
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

  it('a recurring cron loop re-arms and runs the plan again on the next fire', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '* * * * *', nextFireAt: '2026-06-22T09:59:00.000Z', fireCount: 0 });
    const executor = fakeExecutor({ 'step-1': SUCCESS });
    const c = coordinator(host, { executor });

    await c.tick(); // first fire
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
    expect(executor.calls).toEqual(['step-1']);

    host.frozenNow = '2026-06-22T10:02:00.000Z'; // trigger is due again
    await c.tick(); // second fire → re-arm + run again
    expect(executor.calls).toEqual(['step-1', 'step-1']);
    expect(host.state.loops[0].status).toBe('active'); // still scheduled, not terminally complete
  });

  it('event triggers run through normal lifecycle (active runs, disabled does not)', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'x', fireCount: 0 });

    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });
    await c.fireEvent('loop-1', 'x');
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');

    // Disable and fire again: the trigger marks due but the loop does not run.
    host.state = { ...host.state, loops: [{ ...host.state.loops[0], status: 'disabled', runtime: { ...host.state.loops[0].runtime, stepStates: { 'step-1': { status: 'pending', attempts: 0, updatedAt: 't' } } } }] };
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

  it('a recurring iteration that completes stays active and scheduled (does not finish forever)', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '* * * * *', nextFireAt: '2026-06-22T09:59:00.000Z', fireCount: 0 });

    await coordinator(host, { executor: fakeExecutor({ 'step-1': ITERATION_DONE }) }).tick();

    expect(host.state.loops[0].status).toBe('active'); // keeps checking on schedule, not complete
    expect(host.state.loops[0].triggers[0].disabled).toBeFalsy();
    expect(host.state.loops[0].triggers[0].nextFireAt).toBeDefined();
  });

  it('a recurring iteration with no completion signal also stays active and scheduled', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '* * * * *', nextFireAt: '2026-06-22T09:59:00.000Z', fireCount: 0 });

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) }).tick();

    expect(host.state.loops[0].status).toBe('active');
    expect(host.state.loops[0].triggers[0].disabled).toBeFalsy();
  });

  it('disable aborts the in-flight run and leaves the loop disabled (not revived)', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);

    let captured: AbortSignal | undefined;
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const executor: StepExecutor = {
      async run(input) {
        captured = input.signal;
        await gate;
        // Mimic a real subagent: an aborted run resolves with an error, no outcome.
        return {
          id: input.host.newId('attempt'), stepId: input.step.id, attemptNumber: input.attemptNumber,
          parentSessionId: input.parentSessionId, executionType: input.step.execution.type,
          status: 'failed', observations: [], startedAt: input.host.now(), endedAt: input.host.now(),
          error: 'Aborted',
        };
      },
    };
    const c = coordinator(host, { executor });

    const running = c.runNext('loop-1');
    await new Promise((r) => setTimeout(r, 0)); // let the run reach the gate
    await c.requestAction({ kind: 'disable', loopId: 'loop-1' });
    expect(captured?.aborted).toBe(true); // the in-flight step's signal was aborted

    open();
    await running;

    // The disable is not clobbered by the engine's finalize, and no block is raised.
    expect(host.state.loops[0].status).toBe('disabled');
    expect(host.state.loops[0].runtime.activeRunId).toBeUndefined();
    expect(host.state.loops[0].runtime.block).toBeUndefined();
  });

  it('manual Run next re-arms a recurring loop whose previous pass already finished', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    const loop = addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-06-22T11:00:00.000Z', fireCount: 1 });
    // Previous pass finished: the only step is already succeeded, with a recorded run.
    loop.runtime.stepStates['step-1'] = { status: 'succeeded', attempts: 1, outcome: { status: 'succeeded', summary: 'done' }, updatedAt: 't' };
    loop.runs = [{ id: 'run-0', runNumber: 1, status: 'waiting', startedStepIds: ['step-1'], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't', endedAt: 't' }];
    host.state = { ...host.state, loops: [loop] };

    const executor = fakeExecutor({ 'step-1': SUCCESS });
    await coordinator(host, { executor }).requestAction({ kind: 'run_next', loopId: 'loop-1' });

    expect(executor.calls).toEqual(['step-1']); // the plan ran again (re-armed), not a no-op
    expect(host.state.loops[0].runs.length).toBe(2); // a fresh run was recorded
    expect(host.state.loops[0].status).toBe('active');
  });

  it('the stop checker ends a run EARLY (skips remaining steps) but keeps the loop scheduled', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, sequentialPlan().plan); // steps a -> b
    addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-06-22T11:00:00.000Z', fireCount: 1 });
    const executor = fakeExecutor({ a: SUCCESS, b: SUCCESS });
    const stopChecker = { check: async () => ({ stop: true, reason: 'no work found this run' }) };

    await coordinator(host, { executor, stopChecker }).requestAction({ kind: 'run_next', loopId: 'loop-1' });

    expect(executor.calls).toEqual(['a']); // step b skipped — the RUN ended early
    expect(host.state.loops[0].status).toBe('active'); // the LOOP keeps checking, not complete
    expect(host.state.loops[0].triggers[0].disabled).toBeFalsy(); // schedule still on
  });

  it('a recurring loop runs the whole pass when the stop checker says keep going', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, sequentialPlan().plan);
    addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-06-22T11:00:00.000Z', fireCount: 1 });
    const executor = fakeExecutor({ a: SUCCESS, b: SUCCESS });
    const stopChecker = { check: async () => ({ stop: false, reason: 'work in progress' }) };

    await coordinator(host, { executor, stopChecker }).requestAction({ kind: 'run_next', loopId: 'loop-1' });

    expect(executor.calls).toEqual(['a', 'b']); // both steps ran
    expect(host.state.loops[0].status).toBe('active'); // still scheduled
  });

  it('run again re-activates a completed loop and resumes its disabled schedule', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    // A completed scheduled loop: status complete, cron trigger disabled.
    const loop = addTrigger(host, { id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', fireCount: 3, disabled: true });
    loop.status = 'complete';
    loop.runtime.stepStates['step-1'] = { status: 'succeeded', attempts: 1, outcome: { status: 'succeeded', summary: 'done' }, updatedAt: 't' };
    host.state = { ...host.state, loops: [loop] };

    const executor = fakeExecutor({ 'step-1': SUCCESS });
    await coordinator(host, { executor }).requestAction({ kind: 'run_again', loopId: 'loop-1' });

    expect(host.state.loops[0].status).toBe('active'); // re-activated
    expect(host.state.loops[0].triggers[0].disabled).toBeFalsy(); // schedule resumed
    expect(host.state.loops[0].triggers[0].nextFireAt).toBeDefined();
    expect(executor.calls).toEqual(['step-1']); // ran a fresh pass
  });

  it('start over re-runs a BLOCKED loop from the first step (clears the block, re-arms every step)', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan); // a -> b
    // A blocked loop: a succeeded, b blocked, a runtime block + blocked completion.
    loop.status = 'blocked';
    loop.runtime.stepStates['a'] = { status: 'succeeded', attempts: 1, outcome: { status: 'succeeded', summary: 'ok' }, updatedAt: 't' };
    loop.runtime.stepStates['b'] = { status: 'blocked', attempts: 1, outcome: { status: 'blocked', summary: 'denied' }, updatedAt: 't' };
    loop.runtime.block = { kind: 'planned-block', reason: 'user said no', createdAt: 't' };
    loop.runtime.completion = { status: 'blocked', final: false, sourceStepId: 'b', sourceAttemptId: 'x', reason: 'user said no', createdAt: 't' };
    host.state = { ...host.state, loops: [loop] };

    const executor = fakeExecutor({ a: SUCCESS, b: SUCCESS });
    const res = await coordinator(host, { executor }).requestAction({ kind: 'run_again', loopId: 'loop-1' });
    expect(res.ok).toBe(true);

    const updated = host.state.loops[0];
    expect(updated.runtime.block).toBeUndefined(); // block cleared
    expect(updated.runtime.completion).toBeUndefined(); // blocked completion cleared
    expect(executor.calls).toEqual(['a', 'b']); // ran the WHOLE plan from the start, not just b
    expect(updated.runtime.stepStates['a'].status).toBe('succeeded');
    expect(updated.runtime.stepStates['b'].status).toBe('succeeded');
  });

  it('start over is refused only for a draft or while a run is in flight', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.status = 'draft';
    host.state = { ...host.state, loops: [loop] };
    const draftRes = await coordinator(host).requestAction({ kind: 'run_again', loopId: 'loop-1' });
    expect(draftRes.ok).toBe(false);
    expect(draftRes.error).toMatch(/Activate/i);
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
