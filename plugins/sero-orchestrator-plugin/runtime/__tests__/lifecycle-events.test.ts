/**
 * Internal loop:* event emission (Living Loops, spec 12 — Phase 2): completed /
 * blocked / asked-question reach follower loops, a loop never fires itself, and
 * loop→loop chains stop at the depth cap with a visible warning.
 *
 * Emissions are fire-and-forget, so tests settle the microtask/timer queue
 * before asserting.
 */

import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import type { EngineDeps } from '../engine-types';
import type { Loop, LoopTrigger, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeExecutor } from './engine-fakes';

const NOW = '2026-06-22T10:00:00.000Z';
const ITERATION_DONE: StepOutcome = {
  status: 'succeeded',
  summary: 'iteration done',
  completion: { status: 'complete', reason: 'all good' },
};

function coordinator(host: FakeHost, overrides: Partial<EngineDeps> = {}): Coordinator {
  return new Coordinator(host, createEngineDeps(new LoopLocks(), overrides));
}

/** Drains the fire-and-forget emission chain (each hop is a few macrotasks). */
async function settle(rounds = 40): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function eventTrigger(loopId: string, eventSource: string, overrides: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: `${loopId}-${eventSource}`, loopId, workspaceId: 'ws-1', type: 'event', eventSource, fireCount: 0, ...overrides };
}

/** Keeps a loop recurring so a completed iteration leaves it active. */
function cronTrigger(loopId: string): LoopTrigger {
  return { id: `${loopId}-cron`, loopId, workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-06-23T00:00:00.000Z', fireCount: 0 };
}

function setTriggers(host: FakeHost, loopId: string, triggers: LoopTrigger[]): void {
  host.state = { ...host.state, loops: host.state.loops.map((l) => (l.id === loopId ? { ...l, triggers } : l)) };
}

describe('internal loop:* emissions', () => {
  it('a completed run fires a follower listening on loop:completed with the loop id in the payload', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan, 'loop-1');
    seedActiveLoop(host, oneStepPlan().plan, 'loop-2');
    setTriggers(host, 'loop-2', [eventTrigger('loop-2', 'loop:completed', { eventFilter: { loopId: 'loop-1' } })]);
    const executor = fakeExecutor({ 'step-1': ITERATION_DONE });
    const c = coordinator(host, { executor });

    await c.runNext('loop-1');
    await settle();

    const follower = host.state.loops[1];
    expect(follower.triggers[0].fireCount).toBe(1);
    const run = follower.runs.at(-1)!;
    expect(run.firedBy?.source).toBe('loop:completed');
    expect(run.firedBy?.chainDepth).toBe(0);
    expect(run.observations.find((o) => o.source === 'event')?.data).toMatchObject({ loopId: 'loop-1', runNumber: 1 });
  });

  it('a blocked run fires loop:blocked followers with the block reason', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan, 'loop-1');
    seedActiveLoop(host, oneStepPlan().plan, 'loop-2');
    setTriggers(host, 'loop-2', [eventTrigger('loop-2', 'loop:blocked')]);
    const blocked: StepOutcome = {
      status: 'succeeded',
      summary: 'judged',
      completion: { status: 'blocked', reason: 'needs credentials' },
    };
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': blocked }) });

    await c.runNext('loop-1');
    await settle();

    const follower = host.state.loops[1];
    expect(follower.triggers[0].fireCount).toBe(1);
    expect(follower.runs.at(-1)?.observations.find((o) => o.source === 'event')?.data).toMatchObject({
      loopId: 'loop-1',
      reason: 'needs credentials',
    });
  });

  it('a step question fires loop:asked-question followers with the prompts', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan, 'loop-1');
    seedActiveLoop(host, oneStepPlan().plan, 'loop-2');
    setTriggers(host, 'loop-2', [eventTrigger('loop-2', 'loop:asked-question')]);
    const asking: StepOutcome = {
      status: 'needs-revision',
      summary: 'waiting on the user',
      questions: [{ id: 'q1', prompt: 'Drop the legacy table?' }],
    };
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': asking }) });

    await c.runNext('loop-1');
    await settle();

    expect(host.state.loops[0].runtime.pendingInput).toBeDefined(); // asker is parked
    const follower = host.state.loops[1];
    expect(follower.triggers[0].fireCount).toBe(1);
    expect(follower.runs.at(-1)?.observations.find((o) => o.source === 'event')?.data).toMatchObject({
      loopId: 'loop-1',
      questions: ['Drop the legacy table?'],
    });
  });

  it("a loop's own completion never fires its own loop:completed trigger", async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan, 'loop-1');
    // Recurring, so it stays active (and would re-fire itself without the guard).
    setTriggers(host, 'loop-1', [cronTrigger('loop-1'), eventTrigger('loop-1', 'loop:completed')]);
    const executor = fakeExecutor({ 'step-1': ITERATION_DONE });
    const c = coordinator(host, { executor });

    await c.runNext('loop-1');
    await settle();

    expect(executor.calls).toEqual(['step-1']); // exactly one run — no self-trigger
    expect(host.state.loops[0].triggers[1].fireCount).toBe(0);
  });

  it('two loops triggering on each other stop at the chain-depth cap with a warning', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan, 'loop-a');
    seedActiveLoop(host, oneStepPlan().plan, 'loop-b');
    // Both recurring (stay active after completing) and each fires on the other.
    setTriggers(host, 'loop-a', [cronTrigger('loop-a'), eventTrigger('loop-a', 'loop:completed', { eventFilter: { loopId: 'loop-b' } })]);
    setTriggers(host, 'loop-b', [cronTrigger('loop-b'), eventTrigger('loop-b', 'loop:completed', { eventFilter: { loopId: 'loop-a' } })]);
    const executor = fakeExecutor({ 'step-1': ITERATION_DONE });
    const c = coordinator(host, { executor });

    await c.runNext('loop-a');
    await settle(120);

    // a(manual,d1,d3) + b(d0,d2,d4); b's d5 emission is dropped at loop-a.
    expect(executor.calls.length).toBe(6);
    const warned = host.state.loops.find((l) => l.warnings.some((w) => w.code === 'event-chain-depth'));
    expect(warned?.id).toBe('loop-a');
  });
});
