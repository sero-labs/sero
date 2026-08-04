/**
 * Tests for CronScheduler integration with the transient session runner.
 *
 * Validates: job execution via sessions, running-set management,
 * callback invocation, and duplicate prevention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CronJob, CronRunResult, Reminder } from '../../shared/types';
import type { SessionRunOptions, SessionRunResult } from '../session-runner';

// ── Mocks ──────────────────────────────────────────────────────

// Mock session-runner
const mockRunTransientSession = vi.fn();
vi.mock('../session-runner', () => ({
  runTransientSession: (jobKey: string, prompt: string, options?: SessionRunOptions) =>
    mockRunTransientSession(jobKey, prompt, options),
}));

// Mock logger
vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock cron matcher — controlled by tests
const mockMatchesCron = vi.fn();
vi.mock('../../shared/cron', () => ({
  matchesCron: (expression: string, date: Date) => mockMatchesCron(expression, date),
}));

// Mock reminder utils — controllable per test
const mockShouldFire = vi.fn((_reminder: Reminder, _now: Date) => false);
const mockStatusAfterFire = vi.fn((reminder: Reminder): Reminder => ({
  ...reminder,
  status: 'completed',
  lastFiredAt: new Date().toISOString(),
}));
vi.mock('../../shared/reminder-utils', () => ({
  shouldFire: (reminder: Reminder, now: Date) => mockShouldFire(reminder, now),
  statusAfterFire: (reminder: Reminder) => mockStatusAfterFire(reminder),
}));

import { CronScheduler, type SchedulerCallbacks } from '../scheduler';

// ── Helpers ─────────────────────────────────────────────────────

function makeJob(overrides?: Partial<CronJob>): CronJob {
  return {
    name: 'test-job',
    schedule: '0 9 * * *',
    prompt: 'Run the report',
    channel: 'cron',
    disabled: false,
    ...overrides,
  };
}

function defaultSessionResult(overrides?: Partial<SessionRunResult>): SessionRunResult {
  return {
    output: 'Agent completed the task',
    exitCode: 0,
    durationMs: 1500,
    ...overrides,
  };
}

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: 'rem-1',
    title: 'Test Reminder',
    channel: 'notification',
    type: 'once',
    status: 'active',
    createdAt: '2025-06-15T08:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockRunTransientSession.mockReset();
  mockRunTransientSession.mockResolvedValue(defaultSessionResult());
  mockMatchesCron.mockReturnValue(false);
  mockShouldFire.mockReturnValue(false);
  mockStatusAfterFire.mockImplementation((reminder: Reminder) => ({
    ...reminder,
    status: 'completed',
    lastFiredAt: new Date().toISOString(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────────

describe('CronScheduler job execution', () => {
  it('calls runTransientSession with job name, prompt, and options', async () => {
    const job = makeJob({ model: 'sonnet', prompt: 'Summarize logs' });
    const scheduler = new CronScheduler();
    scheduler.start([job], '/test/workspace');

    // Trigger manual run
    scheduler.runNow('test-job');

    // Wait for async execution
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRunTransientSession).toHaveBeenCalledWith(
      'test-job',
      expect.stringContaining('Summarize logs'),
      expect.objectContaining({ model: 'sonnet', cwd: '/test/workspace' }),
    );

    scheduler.stop();
  });

  it('prepends workspace context to prompt when cwd is set', async () => {
    const job = makeJob({ prompt: 'Generate report' });
    const scheduler = new CronScheduler();
    scheduler.start([job], '/my/workspace');

    scheduler.runNow('test-job');
    await vi.advanceTimersByTimeAsync(0);

    const [, prompt] = mockRunTransientSession.mock.calls[0];
    expect(prompt).toContain('/my/workspace');
    expect(prompt).toContain('Generate report');

    scheduler.stop();
  });

  it('fires onJobComplete callback on success', async () => {
    const onJobComplete = vi.fn();
    const scheduler = new CronScheduler({ onJobComplete });
    scheduler.start([makeJob()], '/test');

    scheduler.runNow('test-job');
    await vi.advanceTimersByTimeAsync(0);

    expect(onJobComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: 'test-job',
        ok: true,
        output: 'Agent completed the task',
      }),
    );

    scheduler.stop();
  });

  it('fires onJobComplete with error on session failure', async () => {
    mockRunTransientSession.mockResolvedValueOnce({
      output: '',
      exitCode: 1,
      error: 'Auth failed',
      durationMs: 100,
    });

    const onJobComplete = vi.fn();
    const scheduler = new CronScheduler({ onJobComplete });
    scheduler.start([makeJob()], '/test');

    scheduler.runNow('test-job');
    await vi.advanceTimersByTimeAsync(0);

    expect(onJobComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: 'test-job',
        ok: false,
        error: expect.stringContaining('Auth failed'),
      }),
    );

    scheduler.stop();
  });

  it('fires onJobStart callback', async () => {
    const onJobStart = vi.fn();
    const scheduler = new CronScheduler({ onJobStart });
    scheduler.start([makeJob()], '/test');

    scheduler.runNow('test-job');
    await vi.advanceTimersByTimeAsync(0);

    expect(onJobStart).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'test-job' }),
    );

    scheduler.stop();
  });
});

describe('CronScheduler running-set management', () => {
  it('prevents duplicate execution of the same job', async () => {
    // Make the first run take a while
    let resolveFirst: () => void;
    mockRunTransientSession.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveFirst = () => r(defaultSessionResult());
        }),
    );

    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');

    // First run
    scheduler.runNow('test-job');
    await vi.advanceTimersByTimeAsync(0);

    // Second run while first is in progress
    const msg = scheduler.runNow('test-job');
    expect(msg).toContain('already running');

    // Only one session was created
    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    // Clean up
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
  });

  it('clears running state after completion', async () => {
    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');

    expect(scheduler.getRunningNames()).toEqual([]);

    scheduler.runNow('test-job');
    // Running set is populated synchronously
    expect(scheduler.getRunningNames()).toContain('test-job');

    // Wait for completion
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.getRunningNames()).toEqual([]);

    scheduler.stop();
  });

  it('clears running state even on failure', async () => {
    mockRunTransientSession.mockRejectedValueOnce(new Error('crash'));

    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');

    scheduler.runNow('test-job');
    await vi.advanceTimersByTimeAsync(0);

    expect(scheduler.getRunningNames()).toEqual([]);

    scheduler.stop();
  });
});

describe('CronScheduler tick-based execution', () => {
  it('executes matching jobs on tick', async () => {
    mockMatchesCron.mockReturnValue(true);

    const onJobComplete = vi.fn();
    const scheduler = new CronScheduler({ onJobComplete });
    scheduler.start([makeJob()], '/test');

    // Advance past the first tick (happens immediately in start())
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('skips disabled jobs on tick', async () => {
    mockMatchesCron.mockReturnValue(true);

    const scheduler = new CronScheduler();
    scheduler.start([makeJob({ disabled: true })], '/test');

    await vi.advanceTimersByTimeAsync(0);

    expect(mockRunTransientSession).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('only fires once per minute even with multiple ticks', async () => {
    mockMatchesCron.mockReturnValue(true);

    // Pin to the start of a minute so 30s advance stays within it
    vi.setSystemTime(new Date('2025-06-15T09:00:00'));

    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');

    // First tick fires immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    // Next tick (30s) — same minute, should NOT fire again
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});

describe('CronScheduler lifecycle', () => {
  it('stop() prevents further ticks', async () => {
    mockMatchesCron.mockReturnValue(true);

    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');
    await vi.advanceTimersByTimeAsync(0);

    scheduler.stop();

    // Advance well past multiple tick intervals
    mockRunTransientSession.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockRunTransientSession).not.toHaveBeenCalled();
  });

  it('updateJobs() changes the active job list', async () => {
    const scheduler = new CronScheduler();
    scheduler.start([], '/test');

    const msg = scheduler.runNow('new-job');
    expect(msg).toContain('not found');

    scheduler.updateJobs([makeJob({ name: 'new-job' })]);
    const msg2 = scheduler.runNow('new-job');
    expect(msg2).toContain('Triggered');

    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
  });

  it('runNow returns error for unknown job', () => {
    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');

    const msg = scheduler.runNow('nonexistent');
    expect(msg).toContain('not found');

    scheduler.stop();
  });

  it('getLastTickMinute returns the tracked minute key', async () => {
    vi.setSystemTime(new Date('2025-06-15T09:00:00'));
    mockMatchesCron.mockReturnValue(false);

    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');
    await vi.advanceTimersByTimeAsync(0);

    const lastMinute = scheduler.getLastTickMinute();
    expect(lastMinute).toContain('2025');
    expect(lastMinute).toContain('9');
    expect(lastMinute).toContain('0');

    scheduler.stop();
  });

  it('updateReminders() syncs the in-memory reminder list', () => {
    const scheduler = new CronScheduler();
    scheduler.start([], '/test');

    expect(scheduler.getReminderCount()).toBe(0);

    scheduler.updateReminders([makeReminder()]);
    expect(scheduler.getReminderCount()).toBe(1);

    scheduler.stop();
  });

  it('start() is a no-op if already running', () => {
    mockMatchesCron.mockReturnValue(true);
    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');

    // Clear mock after first tick fires
    mockRunTransientSession.mockClear();

    // Second start should be a no-op (guard: if (this.timer) return)
    scheduler.start([makeJob(), makeJob({ name: 'extra' })], '/test');

    // Should NOT have fired another tick
    expect(mockRunTransientSession).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('isRunning() reflects lifecycle state', () => {
    const scheduler = new CronScheduler();
    expect(scheduler.isRunning()).toBe(false);

    scheduler.start([], '/test');
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
