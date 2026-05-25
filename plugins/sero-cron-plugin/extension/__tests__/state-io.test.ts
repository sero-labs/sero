/**
 * Tests for state file I/O: path resolution, mutex, read, and write.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveStatePath, withStateLock, readState, writeState } from '../state-io';
import { DEFAULT_CRON_STATE } from '../../shared/types';
import type { CronState } from '../../shared/types';

// ── resolveStatePath ─────────────────────────────────────────────

describe('resolveStatePath', () => {
  const origEnv = process.env.SERO_HOME;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.SERO_HOME;
    } else {
      process.env.SERO_HOME = origEnv;
    }
  });

  it('resolves to SERO_HOME when set', () => {
    process.env.SERO_HOME = '/home/test/.sero-ui';
    const result = resolveStatePath('/any/cwd');
    expect(result).toBe(path.join('/home/test/.sero-ui', 'apps', 'cron', 'state.json'));
  });

  it('resolves relative to cwd when SERO_HOME not set', () => {
    delete process.env.SERO_HOME;
    const result = resolveStatePath('/my/project');
    expect(result).toBe(path.join('/my/project', '.sero', 'apps', 'cron', 'state.json'));
  });

  it('ignores cwd when SERO_HOME is set', () => {
    process.env.SERO_HOME = '/sero-home';
    const p1 = resolveStatePath('/project-a');
    const p2 = resolveStatePath('/project-b');
    expect(p1).toBe(p2);
  });
});

// ── withStateLock ────────────────────────────────────────────────

describe('withStateLock', () => {
  it('serialises concurrent operations', async () => {
    const order: number[] = [];

    const op1 = withStateLock(async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 50));
      order.push(2);
      return 'first';
    });

    const op2 = withStateLock(async () => {
      order.push(3);
      return 'second';
    });

    const [r1, r2] = await Promise.all([op1, op2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    // op2 should not start until op1 finishes
    expect(order).toEqual([1, 2, 3]);
  });

  it('releases lock even if operation throws', async () => {
    const failOp = withStateLock(async () => {
      throw new Error('boom');
    });
    await expect(failOp).rejects.toThrow('boom');

    // Next operation should still proceed
    const result = await withStateLock(async () => 'ok');
    expect(result).toBe('ok');
  });
});

// ── readState / writeState ──────────────────────────────────────

describe('readState and writeState', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cron-test-'));
    statePath = path.join(tmpDir, 'state.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('readState returns default state when file does not exist', async () => {
    const state = await readState(statePath);
    expect(state.jobs).toEqual([]);
    expect(state.reminders).toEqual([]);
    expect(state.schedulerActive).toBe(false);
    expect(state.autostart).toBe(false);
    expect(state.lastRunResults).toEqual([]);
  });

  it('writeState creates the file and readState reads it back', async () => {
    const state: CronState = {
      ...DEFAULT_CRON_STATE,
      jobs: [{ name: 'j1', schedule: '0 9 * * *', prompt: 'hi', channel: 'cron', disabled: false }],
      schedulerActive: true,
    };

    await writeState(statePath, state);

    const loaded = await readState(statePath);
    expect(loaded.jobs).toHaveLength(1);
    expect(loaded.jobs[0].name).toBe('j1');
    expect(loaded.schedulerActive).toBe(true);
  });

  it('writeState creates parent directories', async () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'state.json');
    await writeState(nested, DEFAULT_CRON_STATE);
    const loaded = await readState(nested);
    expect(loaded.jobs).toEqual([]);
  });

  it('writeState is atomic (uses tmp + rename)', async () => {
    await writeState(statePath, DEFAULT_CRON_STATE);

    // Check that no .tmp files remain
    const files = await fs.readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('readState fails loud on corrupted JSON', async () => {
    await fs.writeFile(statePath, 'not json {{{', 'utf8');
    await expect(readState(statePath)).rejects.toThrow(/Cron state file/);
  });

  it('readState initialises missing reminders array', async () => {
    await fs.writeFile(statePath, JSON.stringify({ jobs: [], schedulerActive: false, autostart: false, lastRunResults: [] }), 'utf8');
    const state = await readState(statePath);
    expect(state.reminders).toEqual([]);
  });

  it('writeState overwrites existing file', async () => {
    const state1: CronState = { ...DEFAULT_CRON_STATE, autostart: false };
    const state2: CronState = { ...DEFAULT_CRON_STATE, autostart: true };
    await writeState(statePath, state1);
    await writeState(statePath, state2);
    const loaded = await readState(statePath);
    expect(loaded.autostart).toBe(true);
  });

  it('writeState gives concurrent writes unique temp paths', async () => {
    const states = Array.from({ length: 8 }, (_, index): CronState => ({
      ...DEFAULT_CRON_STATE,
      jobs: [{
        name: `j${index}`,
        schedule: '0 9 * * *',
        prompt: 'hi',
        channel: 'cron',
        disabled: false,
      }],
    }));

    await Promise.all(states.map((state) => writeState(statePath, state)));

    const loaded = await readState(statePath);
    expect(loaded.jobs).toHaveLength(1);
    expect(loaded.jobs[0].name).toMatch(/^j\d$/);
    const files = await fs.readdir(tmpDir);
    expect(files.filter((f) => f.includes('.tmp'))).toHaveLength(0);
  });
});
