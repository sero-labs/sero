/**
 * Tests for reminder utility functions.
 *
 * Validates: shouldFire logic, snooze computation, statusAfterFire,
 * ID generation, and display helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Reminder } from '../types';
import {
  shouldFire,
  computeSnoozeUntil,
  snoozeReminder,
  statusAfterFire,
  generateId,
  getSnoozeOptions,
  nextFireDescription,
  statusLabel,
} from '../reminder-utils';

// ── Helpers ──────────────────────────────────────────────────────

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: 'test-123',
    title: 'Test Reminder',
    channel: 'notification',
    type: 'once',
    status: 'active',
    createdAt: '2025-06-15T08:00:00.000Z',
    ...overrides,
  };
}

// ── shouldFire ───────────────────────────────────────────────────

describe('shouldFire', () => {
  describe('completed/disabled reminders', () => {
    it('returns false for completed reminders', () => {
      const r = makeReminder({ status: 'completed' });
      expect(shouldFire(r, new Date())).toBe(false);
    });

    it('returns false for disabled reminders', () => {
      const r = makeReminder({ status: 'disabled' });
      expect(shouldFire(r, new Date())).toBe(false);
    });
  });

  describe('snoozed reminders', () => {
    it('fires when snooze time has passed', () => {
      const r = makeReminder({
        status: 'snoozed',
        snoozedUntil: '2025-06-15T10:00:00.000Z',
      });
      const after = new Date('2025-06-15T10:01:00.000Z');
      expect(shouldFire(r, after)).toBe(true);
    });

    it('fires exactly when snooze expires', () => {
      const r = makeReminder({
        status: 'snoozed',
        snoozedUntil: '2025-06-15T10:00:00.000Z',
      });
      const exact = new Date('2025-06-15T10:00:00.000Z');
      expect(shouldFire(r, exact)).toBe(true);
    });

    it('does not fire before snooze expires', () => {
      const r = makeReminder({
        status: 'snoozed',
        snoozedUntil: '2025-06-15T10:00:00.000Z',
      });
      const before = new Date('2025-06-15T09:59:00.000Z');
      expect(shouldFire(r, before)).toBe(false);
    });
  });

  describe('one-time reminders', () => {
    it('fires when fireAt has passed', () => {
      const r = makeReminder({
        type: 'once',
        fireAt: '2025-06-15T09:00:00.000Z',
      });
      const after = new Date('2025-06-15T09:01:00.000Z');
      expect(shouldFire(r, after)).toBe(true);
    });

    it('does not fire before fireAt', () => {
      const r = makeReminder({
        type: 'once',
        fireAt: '2025-06-15T09:00:00.000Z',
      });
      const before = new Date('2025-06-15T08:59:00.000Z');
      expect(shouldFire(r, before)).toBe(false);
    });

    it('does not re-fire if lastFiredAt >= fireAt', () => {
      const r = makeReminder({
        type: 'once',
        fireAt: '2025-06-15T09:00:00.000Z',
        lastFiredAt: '2025-06-15T09:00:30.000Z',
      });
      const after = new Date('2025-06-15T09:05:00.000Z');
      expect(shouldFire(r, after)).toBe(false);
    });

    it('returns false when fireAt is missing', () => {
      const r = makeReminder({ type: 'once' });
      expect(shouldFire(r, new Date())).toBe(false);
    });
  });

  describe('recurring reminders', () => {
    it('fires when cron matches current time', () => {
      // "0 9 * * *" matches 09:00 any day
      const r = makeReminder({
        type: 'recurring',
        schedule: '0 9 * * *',
      });
      const now = new Date('2025-06-15T09:00:00');
      expect(shouldFire(r, now)).toBe(true);
    });

    it('does not fire when cron does not match', () => {
      const r = makeReminder({
        type: 'recurring',
        schedule: '0 9 * * *',
      });
      const now = new Date('2025-06-15T10:00:00');
      expect(shouldFire(r, now)).toBe(false);
    });

    it('does not fire twice in the same minute', () => {
      const r = makeReminder({
        type: 'recurring',
        schedule: '0 9 * * *',
        lastFiredAt: '2025-06-15T09:00:15.000Z',
      });
      const now = new Date('2025-06-15T09:00:45.000Z');
      expect(shouldFire(r, now)).toBe(false);
    });

    it('fires in a new minute even if fired recently', () => {
      const r = makeReminder({
        type: 'recurring',
        schedule: '* * * * *', // every minute
        lastFiredAt: '2025-06-15T09:00:15.000Z',
      });
      const nextMin = new Date('2025-06-15T09:01:00.000Z');
      expect(shouldFire(r, nextMin)).toBe(true);
    });

    it('returns false for invalid cron expression', () => {
      const r = makeReminder({
        type: 'recurring',
        schedule: 'invalid',
      });
      expect(shouldFire(r, new Date())).toBe(false);
    });

    it('returns false when schedule is missing', () => {
      const r = makeReminder({ type: 'recurring' });
      expect(shouldFire(r, new Date())).toBe(false);
    });
  });

  describe('non-active statuses', () => {
    it('returns false for unknown status', () => {
      const r = makeReminder({ status: 'active', type: 'once' });
      // No fireAt → falls through to return false
      expect(shouldFire(r, new Date())).toBe(false);
    });
  });
});

// ── computeSnoozeUntil ──────────────────────────────────────────

describe('computeSnoozeUntil', () => {
  it('computes snooze for N minutes in the future', () => {
    const before = Date.now();
    const result = new Date(computeSnoozeUntil(15)).getTime();
    const after = Date.now();
    // Should be ~15 minutes in the future
    expect(result).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(result).toBeLessThanOrEqual(after + 15 * 60_000 + 100);
  });

  it('computes "tomorrow 9am" for -1', () => {
    const result = new Date(computeSnoozeUntil(-1));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result.getDate()).toBe(tomorrow.getDate());
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });
});

// ── snoozeReminder ──────────────────────────────────────────────

describe('snoozeReminder', () => {
  it('sets status to snoozed and computes snoozedUntil', () => {
    const r = makeReminder({ status: 'active' });
    const snoozed = snoozeReminder(r, 30);
    expect(snoozed.status).toBe('snoozed');
    expect(snoozed.snoozedUntil).toBeTruthy();
    // Should be ~30 min in the future
    const until = new Date(snoozed.snoozedUntil!).getTime();
    expect(until).toBeGreaterThan(Date.now() + 29 * 60_000);
  });

  it('does not mutate the original reminder', () => {
    const r = makeReminder({ status: 'active' });
    const snoozed = snoozeReminder(r, 15);
    expect(r.status).toBe('active');
    expect(snoozed).not.toBe(r);
  });
});

// ── statusAfterFire ─────────────────────────────────────────────

describe('statusAfterFire', () => {
  it('marks one-time reminders as completed', () => {
    const r = makeReminder({ type: 'once' });
    const updated = statusAfterFire(r);
    expect(updated.status).toBe('completed');
    expect(updated.lastFiredAt).toBeTruthy();
    expect(updated.completedAt).toBeTruthy();
    expect(updated.snoozedUntil).toBeUndefined();
  });

  it('keeps recurring reminders active', () => {
    const r = makeReminder({
      type: 'recurring',
      schedule: '0 9 * * *',
      status: 'snoozed',
      snoozedUntil: '2025-06-15T10:00:00Z',
    });
    const updated = statusAfterFire(r);
    expect(updated.status).toBe('active');
    expect(updated.lastFiredAt).toBeTruthy();
    expect(updated.snoozedUntil).toBeUndefined();
  });

  it('does not mutate the original reminder', () => {
    const r = makeReminder({ type: 'once' });
    const updated = statusAfterFire(r);
    expect(r.status).toBe('active');
    expect(updated).not.toBe(r);
  });
});

// ── generateId ──────────────────────────────────────────────────

describe('generateId', () => {
  it('returns an 8-character string', () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });

  it('only contains lowercase alphanumeric chars', () => {
    const id = generateId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    // With 36^8 possibilities, 100 should all be unique
    expect(ids.size).toBe(100);
  });
});

// ── getSnoozeOptions ────────────────────────────────────────────

describe('getSnoozeOptions', () => {
  it('returns predefined snooze options', () => {
    const opts = getSnoozeOptions();
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.find((o) => o.minutes === 5)).toBeTruthy();
    expect(opts.find((o) => o.minutes === -1)).toBeTruthy(); // tomorrow 9am
  });
});

// ── statusLabel ─────────────────────────────────────────────────

describe('statusLabel', () => {
  it('returns human-readable labels for each status', () => {
    expect(statusLabel('active')).toContain('Active');
    expect(statusLabel('snoozed')).toContain('Snoozed');
    expect(statusLabel('completed')).toContain('Done');
    expect(statusLabel('disabled')).toContain('Disabled');
  });
});

// ── nextFireDescription ─────────────────────────────────────────

describe('nextFireDescription', () => {
  it('returns "Completed" for completed reminders', () => {
    const r = makeReminder({ status: 'completed' });
    expect(nextFireDescription(r)).toBe('Completed');
  });

  it('returns "Disabled" for disabled reminders', () => {
    const r = makeReminder({ status: 'disabled' });
    expect(nextFireDescription(r)).toBe('Disabled');
  });

  it('returns snoozed until time for snoozed reminders', () => {
    const r = makeReminder({
      status: 'snoozed',
      snoozedUntil: '2025-06-15T10:00:00.000Z',
    });
    expect(nextFireDescription(r)).toContain('Snoozed until');
  });

  it('returns "Due now" for past one-time reminders', () => {
    const r = makeReminder({
      type: 'once',
      fireAt: '2020-01-01T00:00:00.000Z', // Far in the past
    });
    expect(nextFireDescription(r)).toBe('Due now');
  });

  it('returns recurring schedule for recurring reminders', () => {
    const r = makeReminder({
      type: 'recurring',
      schedule: '0 9 * * *',
    });
    expect(nextFireDescription(r)).toContain('Recurring');
  });
});
