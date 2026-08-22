/**
 * Tests for the state file watcher.
 *
 * Validates: start/stop lifecycle, debounced sync, own-write
 * suppression, and scheduler update propagation.
 *
 * The watcher uses a REAL fs.watch on a real temp directory, so every
 * test still waits for a real OS filesystem event. Only the 500ms
 * debounce runs on a fake clock: `fs.watch` is wrapped (call-through)
 * so a test can await the watcher's own event instead of sleeping,
 * then advance the debounce timer deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CronState } from '../../shared/types';
import { DEFAULT_CRON_STATE } from '../../shared/types';

// Mock logger
vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

/** Records real fs.watch events so tests can wait on them, not on a clock. */
const fsEvents = vi.hoisted(() => {
  let received: Array<string | null> = [];
  let waiters: Array<() => void> = [];
  return {
    get count() {
      return received.length;
    },
    reset() {
      received = [];
      waiters = [];
    },
    notify(filename: string | null) {
      received.push(filename);
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
    /** Resolves once the watcher has been handed a real event for `name`. */
    async waitFor(name: string): Promise<void> {
      const seen = () => received.some((f) => f === name || !!f?.startsWith(name + '.tmp'));
      while (!seen()) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
});

// Wrap node:fs.watch so the real watcher is still used; we only observe
// when its listener actually fires.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const watch = ((dir: string, opts: unknown, listener: (e: string, f: string | null) => void) =>
    actual.watch(dir, opts as never, (event, filename) => {
      listener(event, filename as string | null);
      fsEvents.notify(filename as string | null);
    })) as typeof actual.watch;
  return { ...actual, watch, default: { ...actual, watch } };
});

import { StateWatcher } from '../state-watcher';
import { info, warn } from '../logger';

/** Matches DEBOUNCE_MS in state-watcher.ts. */
const DEBOUNCE_MS = 500;

// ── Helpers ──────────────────────────────────────────────────────

function makeScheduler() {
  return {
    isRunning: vi.fn(() => true),
    updateJobs: vi.fn(),
    updateReminders: vi.fn(),
  } as any;
}

/** Yield to the event loop's poll phase with a real (tiny) I/O round trip. */
async function yieldIo(): Promise<void> {
  await fs.stat(process.cwd());
}

/** True once sync() has finished — it always logs one of these two. */
function syncLogged(): boolean {
  return (
    vi.mocked(info).mock.calls.some(([tag]) => tag === 'state-watcher:sync') ||
    vi.mocked(warn).mock.calls.some(([tag]) => tag === 'state-watcher:sync-failed')
  );
}

/**
 * Perform a write, wait for the watcher to receive the real fs event for the
 * state file, then run the debounce window on the fake clock.
 *
 * `syncReadsFile: false` is for the paths where sync() returns synchronously
 * (own write, scheduler missing or stopped) and never touches the file.
 */
async function writeAndSettle(
  write: () => Promise<void>,
  { syncReadsFile = true }: { syncReadsFile?: boolean } = {},
): Promise<void> {
  await write();
  await fsEvents.waitFor('state.json');
  // The watcher's own listener scheduled the debounce from that real event.
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  if (!syncReadsFile) return;
  // sync() awaits a real readFile; wait for it to report its outcome.
  for (let i = 0; i < 200 && !syncLogged(); i += 1) await yieldIo();
  expect(syncLogged()).toBe(true);
}

// ── Tests ────────────────────────────────────────────────────────

describe('StateWatcher', () => {
  let tmpDir: string;
  let statePath: string;
  let scheduler: ReturnType<typeof makeScheduler>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cron-watcher-'));
    statePath = path.join(tmpDir, 'state.json');
    scheduler = makeScheduler();
    // Write initial state file
    await fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8');
    fsEvents.reset();
    vi.mocked(info).mockClear();
    vi.mocked(warn).mockClear();
    // Only the debounce timer is faked; Date and file I/O stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('starts and stops without errors', () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();
    watcher.stop();
  });

  it('does not start twice', () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();
    watcher.start(); // should be no-op
    watcher.stop();
  });

  it('stop is safe when not started', () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.stop(); // should not throw
  });

  it('syncs scheduler when state file changes', async () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    // Write new state to trigger the watcher
    const newState: CronState = {
      ...DEFAULT_CRON_STATE,
      jobs: [{ name: 'j1', schedule: '0 9 * * *', prompt: 'test', channel: 'cron', disabled: false }],
    };
    await writeAndSettle(() => fs.writeFile(statePath, JSON.stringify(newState), 'utf8'));

    // The watcher saw a real filesystem event, not just a timer.
    expect(fsEvents.count).toBeGreaterThan(0);
    expect(scheduler.updateJobs).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'j1' })]),
    );

    watcher.stop();
  });

  it('suppresses sync for own writes', async () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    // Mark own write, then write the file
    watcher.markOwnWrite();
    await writeAndSettle(() => fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8'), {
      syncReadsFile: false,
    });

    // Should NOT have synced because we marked our own write
    expect(fsEvents.count).toBeGreaterThan(0);
    expect(scheduler.updateJobs).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('skips sync when scheduler is not running', async () => {
    scheduler.isRunning.mockReturnValue(false);
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    await writeAndSettle(() => fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8'), {
      syncReadsFile: false,
    });

    expect(fsEvents.count).toBeGreaterThan(0);
    expect(scheduler.updateJobs).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('skips sync when scheduler is null', async () => {
    const watcher = new StateWatcher(statePath, () => null);
    watcher.start();

    await writeAndSettle(() => fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8'), {
      syncReadsFile: false,
    });

    // No crash = pass (scheduler is null, so no update calls)
    expect(fsEvents.count).toBeGreaterThan(0);

    watcher.stop();
  });

  it('handles corrupted JSON gracefully', async () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    await writeAndSettle(() => fs.writeFile(statePath, 'not json!!!', 'utf8'));

    // Should not crash, should not update scheduler
    expect(fsEvents.count).toBeGreaterThan(0);
    expect(scheduler.updateJobs).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('initialises missing reminders array on sync', async () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    // Write state without reminders field
    await writeAndSettle(() =>
      fs.writeFile(
        statePath,
        JSON.stringify({ jobs: [{ name: 'j1', schedule: '0 9 * * *', prompt: 'x', channel: 'cron', disabled: false }], schedulerActive: true, autostart: false, lastRunResults: [] }),
        'utf8',
      ),
    );

    expect(fsEvents.count).toBeGreaterThan(0);
    expect(scheduler.updateReminders).toHaveBeenCalledWith([]);

    watcher.stop();
  });
});
