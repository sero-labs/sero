import { afterEach, describe, expect, it } from 'vitest';

import {
  compileCron,
  matchesCron,
  nextFireAfter,
  validateCron,
} from '@plugins/sero-orchestrator-plugin/runtime/cron';
import type { LoopTrigger } from '@plugins/sero-orchestrator-plugin/shared/types';

import { createHarness, fakeAdapter, makeClock, WORKSPACE_ID, type Harness } from './harness';

// DEFAULT_NOW (1_700_000_000_000) sits 40s before its next whole minute, so for a
// "* * * * *" schedule the next fire after that instant is exactly +40_000ms.
const NOW = 1_700_000_000_000;
const NEXT_MINUTE = 1_700_000_040_000;

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

function cronTrigger(
  loopId: string,
  schedule = '* * * * *',
  extra: Partial<LoopTrigger> = {},
): LoopTrigger {
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

// ── Cron math (the copied D-02 adapter) ────────────────────────────────────────

describe('cron', () => {
  it('matches a wildcard schedule at any minute', () => {
    expect(matchesCron('* * * * *', new Date(NOW))).toBe(true);
  });

  it('validates 5-field expressions and reports malformed ones', () => {
    expect(validateCron('*/5 * * * *')).toBeNull();
    expect(validateCron('* * *')).toMatch(/need 5 fields/i);
    expect(() => compileCron('99 * * * *')).toThrow(/out of range/i);
  });

  it('nextFireAfter returns the next whole minute for a wildcard schedule', () => {
    const next = nextFireAfter(compileCron('* * * * *'), new Date(NOW));
    expect(next?.getTime()).toBe(NEXT_MINUTE);
  });

  it('nextFireAfter lands on a matching minute strictly in the future', () => {
    const next = nextFireAfter(compileCron('*/5 * * * *'), new Date(NOW));
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(NOW);
    expect(next!.getTime() - NOW).toBeLessThanOrEqual(5 * 60_000);
    expect(matchesCron('*/5 * * * *', next!)).toBe(true);
  });
});

// ── Catch-up-on-open (Phase 2.5, D-04) ─────────────────────────────────────────

describe('catch-up-on-open', () => {
  it('runs a cron loop that came due while the workspace was closed', async () => {
    const clock = makeClock(NOW);
    const adapter = fakeAdapter('background-worker', async () => ({
      status: 'completed' as const,
      changedFiles: ['src/a.ts'],
    }));
    const h = use(createHarness({ clock: clock.clock, adapter }));
    const loopId = await h.createLoop(); // createdAt = NOW
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
    });

    clock.advance(2 * 60_000); // workspace was "closed" for 2 minutes
    const report = await h.coordinator.catchUpOnOpen();
    await report.settled;

    expect(report.dueLoopIds).toEqual([loopId]);
    const loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(1); // catch-up dispatched a real run
    const trigger = loop?.triggers[0];
    expect(trigger?.fireCount).toBe(1);
    expect(trigger?.lastFireAt).toBeDefined();
    expect(trigger?.nextFireAt).toBeDefined();
  });

  it('fires once per open and never twice (debounce survives via lastFireAt)', async () => {
    const clock = makeClock(NOW);
    // No adapter → run_next is a no-op "not yet", so the loop stays active and we
    // isolate the scheduling dedup from execution/completion.
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
    });

    clock.advance(2 * 60_000);
    const first = await h.coordinator.catchUpOnOpen();
    await first.settled;
    expect(first.dueLoopIds).toEqual([loopId]);

    // Re-open immediately (no time passes) → the advanced anchor is in the future.
    const second = await h.coordinator.catchUpOnOpen();
    await second.settled;
    expect(second.dueLoopIds).toEqual([]);

    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('active');
    expect(loop?.triggers[0]?.fireCount).toBe(1); // not 2
  });

  it('collapses many missed fires into a single catch-up', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)]; // every minute
    });

    clock.advance(3 * 24 * 60 * 60_000); // closed for three days
    const report = await h.coordinator.catchUpOnOpen();
    await report.settled;

    expect(report.dueLoopIds).toEqual([loopId]);
    expect((await h.loop(loopId))?.triggers[0]?.fireCount).toBe(1); // one run, not thousands
  });

  it('arms a fresh trigger without firing when nothing is due yet', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
    });

    const report = await h.coordinator.catchUpOnOpen(); // no time has passed
    await report.settled;

    expect(report.dueLoopIds).toEqual([]);
    const trigger = (await h.loop(loopId))?.triggers[0];
    expect(trigger?.fireCount).toBe(0);
    expect(trigger?.lastFireAt).toBeUndefined();
    expect(trigger?.nextFireAt).toBe(new Date(NEXT_MINUTE).toISOString());
  });

  it('does not catch up a paused loop, leaving its trigger untouched', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [cronTrigger(loopId)];
      loop.status = 'paused';
    });

    clock.advance(2 * 60_000);
    const report = await h.coordinator.catchUpOnOpen();
    await report.settled;

    expect(report.dueLoopIds).toEqual([]);
    const trigger = (await h.loop(loopId))?.triggers[0];
    expect(trigger?.fireCount).toBe(0);
    expect(trigger?.lastFireAt).toBeUndefined();
  });

  it('logs missed event triggers, never silently dropping them', async () => {
    const logs: { message: string; detail?: Record<string, unknown> }[] = [];
    const clock = makeClock(NOW);
    const h = use(
      createHarness({
        clock: clock.clock,
        schedulerLog: (message, detail) => logs.push({ message, detail }),
      }),
    );
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [
        {
          id: 'trg-event',
          loopId,
          workspaceId: WORKSPACE_ID,
          type: 'event',
          eventSource: 'vcs',
          fireCount: 0,
        },
      ];
    });

    const report = await h.coordinator.catchUpOnOpen();
    await report.settled;

    expect(report.dueLoopIds).toEqual([]); // event triggers are not cron-due
    expect(report.missedEventTriggers).toBe(1);
    expect(logs.some((entry) => /event triggers cannot be caught up/i.test(entry.message))).toBe(true);
  });
});
