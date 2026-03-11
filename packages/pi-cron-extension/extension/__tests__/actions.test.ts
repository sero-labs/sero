/**
 * Tests for cron tool action handlers (list, add, update, remove,
 * enable, disable, run).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CronState, CronJob } from '../../shared/types';
import { DEFAULT_CRON_STATE } from '../../shared/types';
import {
  handleList,
  handleAdd,
  handleUpdate,
  handleRemove,
  handleToggle,
  handleRun,
  type ActionDeps,
} from '../actions';

// Mock logger
vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock session-runner (for handleRun)
vi.mock('../session-runner', () => ({
  runTransientSession: vi.fn().mockResolvedValue({
    output: 'done',
    exitCode: 0,
    durationMs: 100,
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeJob(overrides?: Partial<CronJob>): CronJob {
  return {
    name: 'daily-report',
    schedule: '0 9 * * *',
    prompt: 'Generate daily report',
    channel: 'cron',
    disabled: false,
    ...overrides,
  };
}

function makeState(overrides?: Partial<CronState>): CronState {
  return {
    ...DEFAULT_CRON_STATE,
    jobs: [],
    reminders: [],
    lastRunResults: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ActionDeps>): ActionDeps {
  return {
    state: makeState(),
    statePath: '/tmp/test-state.json',
    scheduler: null,
    workspaceCwd: '/test/workspace',
    writeState: vi.fn().mockResolvedValue(undefined),
    appendRunResult: vi.fn().mockResolvedValue(undefined),
    ctxCwd: '/test/workspace',
    ...overrides,
  };
}

// ── handleList ───────────────────────────────────────────────────

describe('handleList', () => {
  it('returns message when no jobs exist', () => {
    const deps = makeDeps();
    expect(handleList(deps)).toBe('No cron jobs configured.');
  });

  it('lists all jobs with status', () => {
    const deps = makeDeps({
      state: makeState({
        jobs: [
          makeJob({ name: 'job-a' }),
          makeJob({ name: 'job-b', disabled: true }),
        ],
      }),
    });
    const result = handleList(deps);
    expect(result).toContain('job-a');
    expect(result).toContain('job-b');
    expect(result).toContain('active');
    expect(result).toContain('disabled');
  });

  it('shows running status for active jobs', () => {
    const mockScheduler = {
      getRunningNames: () => ['job-a'],
      isRunning: () => true,
    } as any;
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'job-a' })] }),
      scheduler: mockScheduler,
    });
    const result = handleList(deps);
    expect(result).toContain('running');
  });

  it('shows scheduler warning when inactive', () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob()] }),
      scheduler: null,
    });
    const result = handleList(deps);
    expect(result).toContain('Scheduler is inactive');
  });

  it('does not show warning when scheduler is active', () => {
    const mockScheduler = {
      getRunningNames: () => [],
      isRunning: () => true,
    } as any;
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob()] }),
      scheduler: mockScheduler,
    });
    const result = handleList(deps);
    expect(result).not.toContain('inactive');
  });

  it('shows model and channel when set', () => {
    const deps = makeDeps({
      state: makeState({
        jobs: [makeJob({ model: 'sonnet', channel: 'reports' })],
      }),
    });
    const result = handleList(deps);
    expect(result).toContain('sonnet');
    expect(result).toContain('reports');
  });
});

// ── handleAdd ────────────────────────────────────────────────────

describe('handleAdd', () => {
  it('adds a valid job to state', async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      { action: 'add', name: 'new-job', schedule: '0 9 * * *', prompt: 'Do stuff' },
      deps,
    );
    expect(result).toContain('Added');
    expect(deps.state.jobs).toHaveLength(1);
    expect(deps.state.jobs[0].name).toBe('new-job');
    expect(deps.writeState).toHaveBeenCalled();
  });

  it('rejects missing required fields', async () => {
    const deps = makeDeps();
    expect(await handleAdd({ action: 'add' }, deps)).toContain('Missing');
    expect(await handleAdd({ action: 'add', name: 'x' }, deps)).toContain('Missing');
    expect(await handleAdd({ action: 'add', name: 'x', schedule: '0 9 * * *' }, deps)).toContain('Missing');
  });

  it('rejects invalid cron expression', async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      { action: 'add', name: 'bad', schedule: 'invalid', prompt: 'test' },
      deps,
    );
    expect(result).toContain('Invalid cron');
  });

  it('rejects duplicate job names', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'existing' })] }),
    });
    const result = await handleAdd(
      { action: 'add', name: 'existing', schedule: '0 9 * * *', prompt: 'test' },
      deps,
    );
    expect(result).toContain('already exists');
  });

  it('sets default channel to "cron"', async () => {
    const deps = makeDeps();
    await handleAdd({ action: 'add', name: 'j', schedule: '0 9 * * *', prompt: 'p' }, deps);
    expect(deps.state.jobs[0].channel).toBe('cron');
  });

  it('stores model when provided', async () => {
    const deps = makeDeps();
    await handleAdd(
      { action: 'add', name: 'j', schedule: '0 9 * * *', prompt: 'p', model: 'sonnet' },
      deps,
    );
    expect(deps.state.jobs[0].model).toBe('sonnet');
  });

  it('updates scheduler with new jobs list', async () => {
    const mockScheduler = { updateJobs: vi.fn() } as any;
    const deps = makeDeps({ scheduler: mockScheduler });
    await handleAdd(
      { action: 'add', name: 'j', schedule: '0 9 * * *', prompt: 'p' },
      deps,
    );
    expect(mockScheduler.updateJobs).toHaveBeenCalledWith(deps.state.jobs);
  });
});

// ── handleUpdate ─────────────────────────────────────────────────

describe('handleUpdate', () => {
  it('updates job fields', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'j1' })] }),
    });
    const result = await handleUpdate(
      { action: 'update', name: 'j1', schedule: '*/5 * * * *', prompt: 'New prompt' },
      deps,
    );
    expect(result).toContain('Updated');
    expect(deps.state.jobs[0].schedule).toBe('*/5 * * * *');
    expect(deps.state.jobs[0].prompt).toBe('New prompt');
  });

  it('rejects missing name', async () => {
    const deps = makeDeps();
    expect(await handleUpdate({ action: 'update' }, deps)).toContain('Missing');
  });

  it('rejects unknown job', async () => {
    const deps = makeDeps();
    expect(await handleUpdate({ action: 'update', name: 'nope' }, deps)).toContain('not found');
  });

  it('validates new schedule', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'j1' })] }),
    });
    const result = await handleUpdate(
      { action: 'update', name: 'j1', schedule: 'bad' },
      deps,
    );
    expect(result).toContain('Invalid cron');
  });

  it('clears model when set to empty string', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'j1', model: 'sonnet' })] }),
    });
    await handleUpdate({ action: 'update', name: 'j1', model: '' }, deps);
    expect(deps.state.jobs[0].model).toBeUndefined();
  });
});

// ── handleRemove ─────────────────────────────────────────────────

describe('handleRemove', () => {
  it('removes job by name', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'doomed' })] }),
    });
    const result = await handleRemove({ action: 'remove', name: 'doomed' }, deps);
    expect(result).toContain('Removed');
    expect(deps.state.jobs).toHaveLength(0);
  });

  it('rejects missing name', async () => {
    const deps = makeDeps();
    expect(await handleRemove({ action: 'remove' }, deps)).toContain('Missing');
  });

  it('rejects unknown job', async () => {
    const deps = makeDeps();
    expect(await handleRemove({ action: 'remove', name: 'nope' }, deps)).toContain('not found');
  });

  it('updates scheduler after removal', async () => {
    const mockScheduler = { updateJobs: vi.fn() } as any;
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'j1' })] }),
      scheduler: mockScheduler,
    });
    await handleRemove({ action: 'remove', name: 'j1' }, deps);
    expect(mockScheduler.updateJobs).toHaveBeenCalledWith([]);
  });
});

// ── handleToggle (enable/disable) ────────────────────────────────

describe('handleToggle', () => {
  it('disables a job', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'j1', disabled: false })] }),
    });
    const result = await handleToggle({ action: 'disable', name: 'j1' }, deps, true);
    expect(result).toContain('Disabled');
    expect(deps.state.jobs[0].disabled).toBe(true);
  });

  it('enables a job', async () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'j1', disabled: true })] }),
    });
    const result = await handleToggle({ action: 'enable', name: 'j1' }, deps, false);
    expect(result).toContain('Enabled');
    expect(deps.state.jobs[0].disabled).toBe(false);
  });

  it('rejects missing name', async () => {
    const deps = makeDeps();
    expect(await handleToggle({ action: 'disable' }, deps, true)).toContain('Missing');
  });

  it('rejects unknown job', async () => {
    const deps = makeDeps();
    expect(await handleToggle({ action: 'disable', name: 'nope' }, deps, true)).toContain('not found');
  });
});

// ── handleRun ────────────────────────────────────────────────────

describe('handleRun', () => {
  it('triggers a fire-and-forget run', () => {
    const deps = makeDeps({
      state: makeState({ jobs: [makeJob({ name: 'run-me' })] }),
    });
    const result = handleRun({ action: 'run', name: 'run-me' }, deps);
    expect(result).toContain('Triggered');
    expect(result).toContain('run-me');
  });

  it('rejects missing name', () => {
    const deps = makeDeps();
    expect(handleRun({ action: 'run' }, deps)).toContain('Missing');
  });

  it('rejects unknown job', () => {
    const deps = makeDeps();
    expect(handleRun({ action: 'run', name: 'nope' }, deps)).toContain('not found');
  });
});
