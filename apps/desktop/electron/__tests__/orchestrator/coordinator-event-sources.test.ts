// Non-session event seams (Phase 6 follow-up): vcs (host.git.onCommit) and
// workspace (host.workspace.onChange) triggers mark loops due, with the
// self-retrigger guard (a loop's own attempt footprint must not re-fire it) and
// the .sero/ metadata filter. `check` stays unwired (covered in the scheduling
// suite). The event-router → gated run_next path is the same one cron uses.

import { afterEach, describe, expect, it } from 'vitest';

import type { LoopTrigger } from '@plugins/sero-orchestrator-plugin/shared/types';

import {
  createHarness,
  fakeAdapter,
  makeClock,
  settle,
  WORKSPACE_ID,
  type Harness,
} from './harness';

const NOW = 1_700_000_000_000;
// Must match SELF_TRIGGER_GRACE_MS in runtime/events.ts.
const GRACE_MS = 2_000;

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

function vcsTrigger(loopId: string, extra: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: `trg-vcs-${loopId}`, loopId, workspaceId: WORKSPACE_ID, type: 'event', eventSource: 'vcs', fireCount: 0, ...extra };
}

function workspaceTrigger(loopId: string, extra: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: `trg-ws-${loopId}`, loopId, workspaceId: WORKSPACE_ID, type: 'event', eventSource: 'workspace', fireCount: 0, ...extra };
}

const completes = () =>
  fakeAdapter('background-worker', async () => ({ status: 'completed' as const, changedFiles: ['src/a.ts'] }));

// ── vcs source ─────────────────────────────────────────────────────────────────

describe('vcs event triggers', () => {
  it('marks a vcs-trigger loop due when a commit lands', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock, adapter: completes() }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [vcsTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.events.commitListenerCount()).toBeGreaterThan(0); // subscribed to the workspace

    h.events.emitCommit('abc123');
    await settle();

    const loop = await h.loop(loopId);
    expect(loop?.triggers[0]?.fireCount).toBe(1);
    expect(loop?.attempts).toHaveLength(1); // marked due → ran an attempt
  });
});

// ── workspace source ─────────────────────────────────────────────────────────────

describe('workspace event triggers', () => {
  it('marks a workspace-trigger loop due when files change', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock, adapter: completes() }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [workspaceTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.events.changeListenerCount()).toBeGreaterThan(0);

    h.events.emitChange(['/workspace/src']);
    await settle();

    const loop = await h.loop(loopId);
    expect(loop?.triggers[0]?.fireCount).toBe(1);
    expect(loop?.attempts).toHaveLength(1);
  });

  it('ignores changes confined to .sero/ (the orchestrator\'s own metadata)', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock, adapter: completes() }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [workspaceTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    h.events.emitChange(['/workspace/.sero/apps/orchestrator', '/workspace/.sero/worktrees/card-1']);
    await settle();

    const loop = await h.loop(loopId);
    expect(loop?.triggers[0]?.fireCount).toBe(0); // metadata-only → never fired
    expect(loop?.attempts ?? []).toHaveLength(0);
  });

  it('drops vcs/workspace subscriptions when no trigger references them', async () => {
    const clock = makeClock(NOW);
    const h = use(createHarness({ clock: clock.clock, adapter: completes() }));
    const loopId = await h.createLoop();
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [vcsTrigger(loopId), workspaceTrigger(loopId)];
    });

    await h.coordinator.armSchedule();
    expect(h.events.commitListenerCount()).toBe(1);
    expect(h.events.changeListenerCount()).toBe(1);

    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [];
    });
    await h.coordinator.armSchedule();
    expect(h.events.commitListenerCount()).toBe(0);
    expect(h.events.changeListenerCount()).toBe(0);
  });
});

// ── self-retrigger guard (non-session) ───────────────────────────────────────────

describe('vcs/workspace self-retrigger guard', () => {
  it('does not re-fire a loop on its OWN attempt footprint (commit + file change)', async () => {
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
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [vcsTrigger(loopId), workspaceTrigger(loopId)];
    });
    await h.coordinator.armSchedule();

    // Attempt 1 starts and blocks inside the adapter (workspace marked busy).
    const first = h.coordinator.requestAction({ kind: 'run_next', loopId });
    await settle();
    expect((await h.loop(loopId))?.attempts).toHaveLength(1);

    // The loop's own work emits a commit + a file change mid-attempt — both are
    // its own footprint and must be ignored (no queued rerun).
    h.events.emitCommit('self-commit');
    h.events.emitChange(['/workspace/src']);
    await settle();

    release();
    await first;
    await settle();

    const loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(1); // exactly one — the footprint did NOT add a run
    expect(loop?.triggers.every((t) => t.fireCount === 0)).toBe(true);
  });

  it('ignores events within the grace window after an attempt, then fires after it', async () => {
    const clock = makeClock(NOW);
    let n = 0;
    const adapter = fakeAdapter('background-worker', async () => {
      n += 1;
      return { status: 'completed' as const, changedFiles: ['src/a.ts'], diffFingerprint: `d${n}` };
    });
    // A failing required check keeps the loop active so it can be triggered again.
    const h = use(
      createHarness({
        clock: clock.clock,
        adapter,
        verify: (command) => ({ command, success: false, stdout: '', stderr: 'boom', durationMs: 1 }),
      }),
    );
    const loopId = await h.createLoop({ checks: [{ type: 'command', command: 'test', required: true }] });
    await h.patchLoop(loopId, (loop) => {
      loop.triggers = [workspaceTrigger(loopId)];
    });
    await h.coordinator.armSchedule();

    // Attempt 1 runs to completion (check fails → loop stays active); clears the
    // workspace busy flag at the current clock, opening the grace window.
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    await settle();
    expect((await h.loop(loopId))?.attempts).toHaveLength(1);

    // Within the grace window: the change is still treated as our own footprint.
    h.events.emitChange(['/workspace/src']);
    await settle();
    expect((await h.loop(loopId))?.attempts).toHaveLength(1);

    // Past the grace window: a genuine external change now fires the loop.
    clock.advance(GRACE_MS + 1);
    h.events.emitChange(['/workspace/src']);
    await settle();
    expect((await h.loop(loopId))?.attempts).toHaveLength(2);
  });
});
