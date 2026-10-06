/**
 * Registered Goal waits through the Goal runtime (spec durable-agent-waits):
 * what wakes a goal, once, and what never does.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { Goal } from '../../shared/goal-types';
import { buildGoalContinuation } from '../../shared/goal-contract';
import { GoalRuntime } from '../goals/goal-runtime';
import { createGoalStore, type GoalStoreIo } from '../goals/goal-store';
import { onGoalWake } from '../goals/goal-wake';
import { SessionDrivers } from '../session-drivers';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const SESSION = '/sessions/chat-1.jsonl';
const T0 = '2026-10-06T09:00:00.000Z';

function memoryIo(files = new Map<string, unknown>()): GoalStoreIo {
  return {
    async read<T>(file: string) { return (files.get(file) as T) ?? null; },
    async write<T>(file: string, data: T) { files.set(file, structuredClone(data)); },
    async remove(file: string) { files.delete(file); },
  };
}

const woken: Goal[] = [];
afterEach(() => { woken.length = 0; });

function setup(files = new Map<string, unknown>(), host: FakeHost = createFakeHost()) {
  host.frozenNow = T0;
  if (host.state.loops.length === 0) seedActiveLoop(host, oneStepPlan().plan, 'loop-1');
  const drivers = new SessionDrivers();
  const runtime = new GoalRuntime(host, createGoalStore(memoryIo(files), '/state'), drivers);
  onGoalWake(SESSION, (goal) => { woken.push(goal); });
  const setLoop = (status: 'active' | 'complete' | 'blocked') => {
    host.state = { ...host.state, loops: host.state.loops.map((loop) => ({ ...loop, status })) };
  };
  const started = async (limits = {}) => {
    const result = await runtime.start({ sessionPath: SESSION, objective: 'ship it', criteria: [], limits });
    if (!result.goal) throw new Error(result.text);
    return result.goal;
  };
  const park = (goal: Goal, extra: Record<string, unknown> = {}) =>
    runtime.reportWait(goal.id, SESSION, 'for the Workflow', { source: { kind: 'child', id: 'loop-1' }, ...extra });
  return { files, host, drivers, runtime, setLoop, started, park };
}

describe('registering a Goal wait', () => {
  it('parks the goal on a Workflow, and refuses process, CI, free text and an unknown Workflow without parking it', async () => {
    const { runtime, started, park } = setup();
    const goal = await started();
    for (const kind of ['process', 'ci', 'when the tests look fine']) {
      expect(await park(goal, { source: { kind, id: 'x' } })).toMatchObject({ ok: false, text: expect.stringMatching(/Manual resume is required/) });
    }
    expect(await park(goal, { source: { kind: 'child', id: 'no-such-loop' } })).toMatchObject({ ok: false });
    expect((await runtime.forSession(SESSION))?.status).toBe('active');

    expect(await park(goal)).toMatchObject({ ok: true });
    const parked = await runtime.forSession(SESSION);
    expect(parked).toMatchObject({ status: 'waiting', waits: [{ source: { kind: 'child', id: 'loop-1' }, outcome: null }] });
  });

  it('keeps the reason-only wait manual: nothing wakes it', async () => {
    const { runtime, started, setLoop } = setup();
    const goal = await started();
    await runtime.reportWait(goal.id, SESSION, 'for the Workflow');
    setLoop('complete');
    await runtime.observeState(createFakeHost().state);
    await runtime.waits.reconcile();
    expect(await runtime.forSession(SESSION)).toMatchObject({ status: 'waiting' });
    expect(woken).toHaveLength(0);
  });
});

describe('a matched Goal wait continues the goal once', () => {
  it('wakes for a completion that happened before the registration, and not again', async () => {
    const { host, runtime, started, park, setLoop } = setup();
    const goal = await started();
    setLoop('complete');
    expect(await park(goal)).toMatchObject({ ok: true, text: expect.stringContaining('already ended') });
    expect(woken).toHaveLength(1);
    const active = await runtime.forSession(SESSION);
    expect(active).toMatchObject({ status: 'active' });
    expect(buildGoalContinuation(active as Goal)).toContain('a wait you registered ended');
    // Duplicate notifications and a restart re-read give nothing more.
    for (let i = 0; i < 3; i += 1) await runtime.observeState(host.state);
    await runtime.reconcile();
    expect(woken).toHaveLength(1);
    // The loop marks it consumed as the turn starts; it is then no longer pending.
    expect((await runtime.consumeWakes(goal.id))?.waits?.[0].wake?.consumedAt).toBe(T0);
    expect(buildGoalContinuation((await runtime.forSession(SESSION)) as Goal)).not.toContain('a wait you registered ended');
  });

  it('stays waiting while the condition is unmet, however many notifications arrive', async () => {
    const { host, runtime, started, park } = setup();
    await park(await started());
    for (let i = 0; i < 3; i += 1) await runtime.observeState(host.state);
    expect(woken).toHaveLength(0);
    expect(await runtime.forSession(SESSION)).toMatchObject({ status: 'waiting' });
  });

  it('is found on restart when the Workflow ended while Sero was closed', async () => {
    const first = setup();
    await first.park(await first.started());
    first.setLoop('complete');
    // A new process: a new runtime over the same files and state, nothing was notified.
    const restarted = setup(first.files, first.host);
    await restarted.runtime.reconcile();
    expect(woken).toHaveLength(1);
    expect(await restarted.runtime.forSession(SESSION)).toMatchObject({ status: 'active' });
    await restarted.runtime.reconcile();
    expect(woken).toHaveLength(1);
  });

  it('does not extend or consume the active time limit while it waits', async () => {
    const { host, runtime, started, park, setLoop } = setup();
    const goal = await started({ maxWallClockMs: 10 * 60_000 });
    await park(goal);
    host.frozenNow = '2026-10-07T09:00:00.000Z';
    setLoop('complete');
    await runtime.observeState(host.state);
    const resumed = await runtime.forSession(SESSION);
    expect(resumed).toMatchObject({ status: 'active', usage: { activeMs: 0 } });
    // A goal already at its limit is limited by the wake, never extended by it.
    const full = setup(new Map(), createFakeHost());
    full.host.frozenNow = T0;
    const capped = await full.started({ maxAttemptsTotal: 0 });
    await full.park(capped);
    full.setLoop('complete');
    await full.runtime.observeState(full.host.state);
    expect((await full.runtime.forSession(SESSION))?.status).toBe('limited');
  });
});

describe('user controls govern a Goal wake', () => {
  it('keeps an outcome that arrives while paused, then tells the resumed turn once', async () => {
    const { host, runtime, started, park, setLoop } = setup();
    const goal = await started();
    await park(goal);
    await runtime.pause(goal.id, 'user', 'the user paused the goal');
    setLoop('complete');
    await runtime.observeState(host.state);
    expect(woken).toHaveLength(0);
    expect(await runtime.forSession(SESSION)).toMatchObject({ status: 'paused', waits: [{ outcome: { kind: 'satisfied' }, wake: null }] });
    const resumed = await runtime.resume(goal.id);
    expect(resumed.goal && buildGoalContinuation(resumed.goal)).toContain('a wait you registered ended');
    await runtime.observeState(host.state);
    expect(woken).toHaveLength(0);
  });

  it('gives nothing after a stop, even when the Workflow then completes', async () => {
    const { host, runtime, started, park, setLoop } = setup();
    const goal = await started();
    await park(goal);
    await runtime.stop(goal.id);
    setLoop('complete');
    await runtime.observeState(host.state);
    await runtime.reconcile();
    expect(woken).toHaveLength(0);
    expect(await runtime.forSession(SESSION)).toBeNull();
    const stopped = (await runtime.list())[0];
    expect(stopped.waits?.[0].outcome).toMatchObject({ kind: 'cancelled' });
  });

  it('stays waiting, outcome kept, when another driver holds the session', async () => {
    const { host, drivers, runtime, started, park, setLoop } = setup();
    const goal = await started();
    await park(goal);
    drivers.claim('sess-1', { kind: 'workflow-step', ownerId: 'loop-9' });
    setLoop('complete');
    await runtime.observeState(host.state);
    expect(woken).toHaveLength(0);
    expect(await runtime.forSession(SESSION)).toMatchObject({ status: 'waiting', waits: [{ outcome: { kind: 'satisfied' }, wake: null }] });
  });
});

describe('a wake that is deciding while the user stops or pauses', () => {
  async function heldAtClaim() {
    const ctx = setup();
    const goal = await ctx.started();
    await ctx.park(goal);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = ctx.host.session.getActiveForWorkspace;
    ctx.host.session.getActiveForWorkspace = async (...args) => { await gate; return read(...args); };
    ctx.setLoop('complete');
    const waking = ctx.runtime.observeState(ctx.host.state);
    // Let the wake reach its wait for the session before the user acts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { ...ctx, goal, waking, release };
  }

  it('leaves a pause the user made while the wake waited for the session', async () => {
    const { runtime, drivers, goal, waking, release } = await heldAtClaim();
    await runtime.pause(goal.id, 'user', 'the user paused the goal');
    release();
    await waking;
    expect(woken).toHaveLength(0);
    expect(await runtime.forSession(SESSION)).toMatchObject({ status: 'paused', pauseReason: 'user' });
    // The session was not left claimed for a wake that did not happen.
    expect(drivers.claim('sess-1', { kind: 'workflow-step', ownerId: 'loop-9' }).ok).toBe(true);
  });

  it('leaves a stop the user made while the wake waited for the session', async () => {
    const { runtime, goal, waking, release } = await heldAtClaim();
    await runtime.stop(goal.id);
    release();
    await waking;
    expect(woken).toHaveLength(0);
    const stopped = (await runtime.list())[0];
    expect(stopped.status).toBe('paused');
    expect(stopped.closedAt).toEqual(expect.any(String));
  });
});

describe('failed and expired Goal waits', () => {
  it('wakes once to say the wait expired, never as completion', async () => {
    const { host, runtime, started, park } = setup();
    await park(await started(), { deadlineMinutes: 5 });
    host.frozenNow = '2026-10-06T10:00:00.000Z';
    await runtime.reconcile();
    expect(woken).toHaveLength(1);
    const text = buildGoalContinuation((await runtime.forSession(SESSION)) as Goal);
    expect(text).toContain('expired');
    expect(text).toContain('not completion');
  });

  it('wakes once to say the Workflow failed', async () => {
    const { host, runtime, started, park, setLoop } = setup();
    await park(await started());
    setLoop('blocked');
    await runtime.observeState(host.state);
    expect(woken).toHaveLength(1);
    expect(buildGoalContinuation((await runtime.forSession(SESSION)) as Goal)).toContain('failed');
  });
});
