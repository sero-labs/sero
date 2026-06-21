import { afterEach, describe, expect, it } from 'vitest';

import { earliestNextFire } from '@plugins/sero-orchestrator-plugin/runtime/scheduler';
import type {
  ExecutionMode,
  LoopGoal,
  LoopTrigger,
} from '@plugins/sero-orchestrator-plugin/shared/types';

import {
  createHarness,
  fakeAdapter,
  makeClock,
  settle,
  WORKSPACE_ID,
  type Harness,
} from './harness';

// DEFAULT_NOW sits 40s before its next whole minute, so the next fire of a
// "* * * * *" schedule is +40_000ms; the minute after is +100_000ms.
const NOW = 1_700_000_000_000;
const TO_NEXT_MINUTE = 40_000;
const A_MINUTE = 60_000;

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

function cronTrigger(loopId: string, schedule = '* * * * *', extra: Partial<LoopTrigger> = {}): LoopTrigger {
  return {
    id: `trg-${schedule}-${loopId}`,
    loopId,
    workspaceId: WORKSPACE_ID,
    type: 'cron',
    schedule,
    fireCount: 0,
    ...extra,
  };
}

function sessionTrigger(loopId: string, extra: Partial<LoopTrigger> = {}): LoopTrigger {
  return {
    id: `trg-session-${loopId}`,
    loopId,
    workspaceId: WORKSPACE_ID,
    type: 'event',
    eventSource: 'session',
    fireCount: 0,
    ...extra,
  };
}

// ── earliestNextFire (the smart-alarm brain) ───────────────────────────────────

describe('earliestNextFire', () => {
  const base: LoopGoal = {
    id: 'loop-x',
    workspaceId: WORKSPACE_ID,
    executionMode: 'background-worker',
    title: 't',
    goal: 'g',
    status: 'active',
    triggers: [],
    checks: [],
    stopRule: { maxAttempts: 10, requireAllChecks: true },
    logPolicy: { maxInlineOutputBytes: 1000, retainArtifacts: false, retainAttempts: 50 },
    tasks: [],
    attempts: [],
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
  };

  it('returns the soonest due moment across loops', () => {
    const loops: LoopGoal[] = [
      { ...base, id: 'a', triggers: [cronTrigger('a', '*/5 * * * *')] },
      { ...base, id: 'b', triggers: [cronTrigger('b', '* * * * *')] },
    ];
    const next = earliestNextFire(loops, new Date(NOW));
    expect(next?.getTime()).toBe(NOW + TO_NEXT_MINUTE); // the every-minute loop wins
  });

  it('returns null when nothing is schedulable (paused / no cron / exhausted)', () => {
    const loops: LoopGoal[] = [
      { ...base, id: 'a', status: 'paused', triggers: [cronTrigger('a')] },
      { ...base, id: 'b', triggers: [{ ...cronTrigger('b'), maxFires: 1, fireCount: 1 }] },
      { ...base, id: 'c', triggers: [sessionTrigger('c')] },
    ];
    expect(earliestNextFire(loops, new Date(NOW))).toBeNull();
  });
});

// ── Smart cron alarm (live, open workspace) ────────────────────────────────────

describe('cron alarm', () => {
  it('arms one timer for the next due moment, not a fixed interval', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.timer.armedDelay()).toBe(TO_NEXT_MINUTE);
  });

  it('disarms entirely when no schedulable trigger exists (no idle wakeups)', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop(); // no triggers
    await h.patchLoop(loopId, (loop) => {
      loop.status = 'paused';
      loop.triggers = [cronTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.timer.armedDelay()).toBeNull();
  });

  it('fires the loop due once at the scheduled minute, then re-arms for the next', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    clock.advance(TO_NEXT_MINUTE); // the timer "elapses" at the scheduled minute
    h.timer.fire();
    await settle();

    expect((await h.loop(loopId))?.triggers[0]?.fireCount).toBe(1);
    // Re-armed for the following minute, not re-fired for the same one.
    expect(h.timer.armedDelay()).toBe(A_MINUTE);

    // Firing again without time passing does not double-fire (anchor advanced).
    h.timer.fire();
    await settle();
    expect((await h.loop(loopId))?.triggers[0]?.fireCount).toBe(1);
  });

  it('collapses fires missed while the machine slept into a single catch-up', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)]; // every minute
    });

    await h.coordinator.armSchedule();
    clock.advance(3 * 24 * A_MINUTE * 60); // slept for three days
    h.timer.fire(); // late wake
    await settle();

    expect((await h.loop(loopId))?.triggers[0]?.fireCount).toBe(1); // one run, not thousands
  });

  it('drives a real attempt end to end when the alarm fires', async () => {
    const clock = makeClock(NOW);
    const adapter = fakeAdapter('background-worker', async () => ({
      status: 'completed' as const,
      changedFiles: ['src/a.ts'],
    }));
    const h = use(createHarness({ clock: clock.clock, adapter }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    clock.advance(TO_NEXT_MINUTE);
    h.timer.fire();
    await settle();

    expect((await h.loop(loopId))?.attempts).toHaveLength(1);
    expect((await h.loop(loopId))?.status).toBe('complete');
  });
});

// ── Event triggers (session) ───────────────────────────────────────────────────

describe('session event triggers', () => {
  it('marks a session-event loop due when a turn completes', async () => {
    const clock = makeClock(NOW);
    const adapter = fakeAdapter('background-worker', async () => ({
      status: 'completed' as const,
      changedFiles: ['src/a.ts'],
    }));
    const h = use(createHarness({ clock: clock.clock, adapter }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [sessionTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.session.listenerCount()).toBeGreaterThan(0); // subscribed to the active session

    h.session.emitTurn('user-turn-1');
    await settle();

    const loop = await h.loop(loopId);
    expect(loop?.triggers[0]?.fireCount).toBe(1);
    expect(loop?.attempts).toHaveLength(1); // marked due → ran an attempt
  });

  it('logs still-unwired event sources (check) as not-yet-wired rather than dropping them', async () => {
    const logs: { message: string; detail?: Record<string, unknown> }[] = [];
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock, schedulerLog: (m, d) => logs.push({ message: m, detail: d }) }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [sessionTrigger(loopId, { id: 'trg-check', eventSource: 'check' })];
    });

    await h.coordinator.armSchedule();
    expect(logs.some((e) => /no host subscription seam yet/i.test(e.message) && e.detail?.source === 'check')).toBe(true);
  });

  it('does not re-fire a loop on its OWN active-session steer (self-retrigger guard)', async () => {
    const clock = makeClock(NOW);
    const h = use(
      createHarness({
        clock: clock.clock,
        session: { steer: () => ({ changedFiles: ['src/a.ts'], diff: 'x' }) },
      }),
    );
    const loopId = await h.createLoop({ executionMode: 'active-session' as ExecutionMode });
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [sessionTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.session.listenerCount()).toBeGreaterThan(0);

    // Drive the loop's own active-session attempt; its steer completes a turn.
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    await settle();

    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete'); // the steer ran and checks passed
    expect(loop?.attempts).toHaveLength(1); // exactly one — the event did NOT add a run
    expect(loop?.triggers[0]?.fireCount).toBe(0); // the loop's own turn never fired its trigger
  });
});

// ── Due-again deferral (event/cron during a running attempt) ────────────────────

describe('due-again deferral', () => {
  it('queues a trigger that fires during a running attempt; runs it after, never overlapping', async () => {
    const clock = makeClock(NOW);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const adapter = fakeAdapter('background-worker', async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight -= 1;
      return { status: 'completed' as const, changedFiles: ['src/a.ts'], diffFingerprint: `d${maxInFlight}` };
    });
    // A required check that always fails → the loop iterates instead of completing.
    const h = use(createHarness({ clock: clock.clock, adapter, verify: (command) => ({ command, success: false, stdout: '', stderr: 'boom', durationMs: 1 }) }));
    const loopId = await h.createLoop({ checks: [{ type: 'command', command: 'test', required: true }] });

    // Attempt 1 starts and blocks inside the adapter.
    const first = h.coordinator.requestAction({ kind: 'run_next', loopId });
    await settle();
    expect((await h.loop(loopId))?.attempts).toHaveLength(1);

    // A trigger fires mid-attempt → queued, not a second concurrent attempt.
    const queued = await h.coordinator.requestAction({ kind: 'run_next', loopId, queueIfBusy: true });
    expect(queued.ok).toBe(true);
    expect(queued.message).toMatch(/queued to run/i);
    expect((await h.loop(loopId))?.attempts).toHaveLength(1); // still just one

    // Let attempt 1 finish; the queued rerun then runs attempt 2 (gate already open).
    release();
    await first;
    await settle();

    expect((await h.loop(loopId))?.attempts).toHaveLength(2);
    expect(maxInFlight).toBe(1); // attempts never overlapped (per-loop lock held)
  });

  it('still rejects a manual run_next on a busy loop (no queue for the tool surface)', async () => {
    const clock = makeClock(NOW);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = fakeAdapter('background-worker', async () => {
      await gate;
      return { status: 'completed' as const, changedFiles: ['src/a.ts'] };
    });
    const h = use(createHarness({ clock: clock.clock, adapter }));
    const loopId = await h.createLoop();

    const first = h.coordinator.requestAction({ kind: 'run_next', loopId });
    await settle();

    const manual = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(manual.ok).toBe(false);
    expect(manual.error).toMatch(/already running/i);

    release();
    await first;
    await settle();
  });
});
