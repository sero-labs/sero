/**
 * Tests for the state file watcher.
 *
 * Validates: start/stop lifecycle, debounced sync, own-write
 * suppression, and scheduler update propagation.
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

import { StateWatcher } from '../state-watcher';

// ── Helpers ──────────────────────────────────────────────────────

function makeScheduler() {
  return {
    isRunning: vi.fn(() => true),
    updateJobs: vi.fn(),
    updateReminders: vi.fn(),
  } as any;
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
  });

  afterEach(async () => {
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
    await fs.writeFile(statePath, JSON.stringify(newState), 'utf8');

    // Wait for debounce (500ms) + a buffer
    await new Promise((r) => setTimeout(r, 900));

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
    await fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8');

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 900));

    // Should NOT have synced because we marked our own write
    expect(scheduler.updateJobs).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('skips sync when scheduler is not running', async () => {
    scheduler.isRunning.mockReturnValue(false);
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    await fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8');
    await new Promise((r) => setTimeout(r, 900));

    expect(scheduler.updateJobs).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('skips sync when scheduler is null', async () => {
    const watcher = new StateWatcher(statePath, () => null);
    watcher.start();

    await fs.writeFile(statePath, JSON.stringify(DEFAULT_CRON_STATE), 'utf8');
    await new Promise((r) => setTimeout(r, 900));

    // No crash = pass (scheduler is null, so no update calls)
    watcher.stop();
  });

  it('handles corrupted JSON gracefully', async () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    await fs.writeFile(statePath, 'not json!!!', 'utf8');
    await new Promise((r) => setTimeout(r, 900));

    // Should not crash, should not update scheduler
    expect(scheduler.updateJobs).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('initialises missing reminders array on sync', async () => {
    const watcher = new StateWatcher(statePath, () => scheduler);
    watcher.start();

    // Write state without reminders field
    await fs.writeFile(
      statePath,
      JSON.stringify({ jobs: [{ name: 'j1', schedule: '0 9 * * *', prompt: 'x', channel: 'cron', disabled: false }], schedulerActive: true, autostart: false, lastRunResults: [] }),
      'utf8',
    );
    await new Promise((r) => setTimeout(r, 900));

    expect(scheduler.updateReminders).toHaveBeenCalledWith([]);

    watcher.stop();
  });
});
