/**
 * Tests for CronScheduler restart dedup and reminder tick behavior.
 *
 * Split from scheduler.test.ts to stay within the 500 LOC limit.
 * Validates: lastTickMinute carry-over on restart, reminder firing,
 * in-memory update after fire, and multi-reminder ticks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CronJob } from '../../shared/types';

// ── Mocks ──────────────────────────────────────────────────────

const mockRunTransientSession = vi.fn();
vi.mock('../session-runner', () => ({
  runTransientSession: (...args: any[]) => mockRunTransientSession(...args),
}));

vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockMatchesCron = vi.fn();
vi.mock('../../shared/cron', () => ({
  matchesCron: (...args: any[]) => mockMatchesCron(...args),
}));

const mockShouldFire = vi.fn(() => false);
const mockStatusAfterFire = vi.fn((r: any) => ({ ...r, status: 'completed', lastFiredAt: new Date().toISOString() }));
vi.mock('../../shared/reminder-utils', () => ({
  shouldFire: (...args: any[]) => mockShouldFire(...args),
  statusAfterFire: (...args: any[]) => mockStatusAfterFire(...args),
}));

import { CronScheduler } from '../scheduler';
import type { Reminder } from '../../shared/types';

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

function defaultSessionResult(overrides?: Partial<any>) {
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
  mockStatusAfterFire.mockImplementation((r: any) => ({ ...r, status: 'completed', lastFiredAt: new Date().toISOString() }));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Restart with lastTickMinute (duplicate prevention fix) ───────

describe('CronScheduler restart dedup', () => {
  it('does not re-fire jobs when restarted with same lastTickMinute', async () => {
    mockMatchesCron.mockReturnValue(true);
    vi.setSystemTime(new Date('2025-06-15T09:00:00'));

    const scheduler1 = new CronScheduler();
    scheduler1.start([makeJob()], '/test');
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    const prevMinute = scheduler1.getLastTickMinute();
    scheduler1.stop();
    mockRunTransientSession.mockClear();

    // Restart within the same minute, passing lastTickMinute
    const scheduler2 = new CronScheduler();
    scheduler2.start([makeJob()], '/test', [], { lastTickMinute: prevMinute });
    await vi.advanceTimersByTimeAsync(0);

    // Should NOT fire again in the same minute
    expect(mockRunTransientSession).not.toHaveBeenCalled();

    scheduler2.stop();
  });

  it('fires jobs in a new minute after restart', async () => {
    mockMatchesCron.mockReturnValue(true);
    vi.setSystemTime(new Date('2025-06-15T09:00:00'));

    const scheduler1 = new CronScheduler();
    scheduler1.start([makeJob()], '/test');
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    const prevMinute = scheduler1.getLastTickMinute();
    scheduler1.stop();
    mockRunTransientSession.mockClear();

    // Advance to the next minute
    vi.setSystemTime(new Date('2025-06-15T09:01:00'));

    const scheduler2 = new CronScheduler();
    scheduler2.start([makeJob()], '/test', [], { lastTickMinute: prevMinute });
    await vi.advanceTimersByTimeAsync(0);

    // Should fire in the new minute
    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    scheduler2.stop();
  });

  it('fires jobs normally without lastTickMinute option', async () => {
    mockMatchesCron.mockReturnValue(true);
    vi.setSystemTime(new Date('2025-06-15T09:00:00'));

    const scheduler = new CronScheduler();
    scheduler.start([makeJob()], '/test');
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRunTransientSession).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});

// ── Reminder tick tests ──────────────────────────────────────────

describe('CronScheduler reminder ticks', () => {
  it('fires onReminderFire when shouldFire returns true', async () => {
    mockShouldFire.mockReturnValue(true);

    const onReminderFire = vi.fn();
    const onReminderUpdate = vi.fn();
    const scheduler = new CronScheduler({ onReminderFire, onReminderUpdate });
    scheduler.start([], '/test', [makeReminder()]);

    await vi.advanceTimersByTimeAsync(0);

    expect(onReminderFire).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rem-1', title: 'Test Reminder' }),
    );
  });

  it('calls onReminderUpdate with post-fire state', async () => {
    mockShouldFire.mockReturnValue(true);

    const onReminderUpdate = vi.fn();
    const scheduler = new CronScheduler({ onReminderUpdate });
    scheduler.start([], '/test', [makeReminder()]);

    await vi.advanceTimersByTimeAsync(0);

    expect(onReminderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('updates in-memory reminder to prevent re-firing on next tick', async () => {
    let callCount = 0;
    mockShouldFire.mockImplementation(() => {
      callCount++;
      // Only fire on the first call
      return callCount === 1;
    });

    const onReminderFire = vi.fn();
    const scheduler = new CronScheduler({ onReminderFire });
    scheduler.start([], '/test', [makeReminder()]);

    // First tick
    await vi.advanceTimersByTimeAsync(0);
    expect(onReminderFire).toHaveBeenCalledTimes(1);

    // Second tick (30s later) — shouldFire returns false
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onReminderFire).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('does not fire reminders when list is empty', async () => {
    // Reset all mocks to ensure clean state
    mockShouldFire.mockReset();
    mockShouldFire.mockReturnValue(false);

    const onReminderFire = vi.fn();
    const scheduler = new CronScheduler({ onReminderFire });
    scheduler.start([], '/test', []);

    // First tick + one interval tick
    await vi.advanceTimersByTimeAsync(30_000);

    expect(onReminderFire).not.toHaveBeenCalled();
    // shouldFire should never be called because reminders list is empty
    // (the tickReminders method early-returns for empty list)
    expect(mockShouldFire).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('fires multiple reminders in the same tick', async () => {
    mockShouldFire.mockReturnValue(true);

    const onReminderFire = vi.fn();
    const scheduler = new CronScheduler({ onReminderFire });
    scheduler.start([], '/test', [
      makeReminder({ id: 'a', title: 'First' }),
      makeReminder({ id: 'b', title: 'Second' }),
    ]);

    await vi.advanceTimersByTimeAsync(0);

    expect(onReminderFire).toHaveBeenCalledTimes(2);
    const ids = onReminderFire.mock.calls.map((c: any[]) => c[0].id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');

    scheduler.stop();
  });

  it('reminders are checked every tick (not limited to once per minute like jobs)', async () => {
    mockShouldFire.mockReset();
    mockStatusAfterFire.mockReset();

    // shouldFire always returns true (simulating recurring reminder)
    mockShouldFire.mockReturnValue(true);
    // statusAfterFire keeps it active (recurring behavior)
    mockStatusAfterFire.mockImplementation((r: any) => ({
      ...r,
      status: 'active',
      lastFiredAt: new Date().toISOString(),
    }));

    vi.setSystemTime(new Date('2025-06-15T09:00:00'));

    const onReminderFire = vi.fn();
    const scheduler = new CronScheduler({ onReminderFire });
    scheduler.start([], '/test', [makeReminder({ type: 'recurring', schedule: '* * * * *' })]);

    // First tick (immediate in start())
    await vi.advanceTimersByTimeAsync(0);
    const firstTickFireCount = onReminderFire.mock.calls.length;
    expect(firstTickFireCount).toBeGreaterThanOrEqual(1);

    // Second tick (30s later, same minute) — reminders are checked every tick
    const shouldFireCallsBefore = mockShouldFire.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    // shouldFire should have been called again on the second tick
    expect(mockShouldFire.mock.calls.length).toBeGreaterThan(shouldFireCallsBefore);

    scheduler.stop();
  });
});
