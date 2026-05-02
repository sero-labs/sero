/**
 * Tests for the cron expression parser, validator, matcher, and formatter.
 */

import { describe, it, expect } from 'vitest';
import { matchesCron, validateCron, cronToHuman } from '../cron';

// ── matchesCron ──────────────────────────────────────────────────

describe('matchesCron', () => {
  it('matches wildcard expression against any date', () => {
    expect(matchesCron('* * * * *', new Date('2025-06-15T09:30:00'))).toBe(true);
    expect(matchesCron('* * * * *', new Date('2025-01-01T00:00:00'))).toBe(true);
  });

  it('matches exact minute and hour', () => {
    // "0 9 * * *" = minute 0, hour 9
    const date = new Date('2025-06-15T09:00:00');
    expect(matchesCron('0 9 * * *', date)).toBe(true);
    expect(matchesCron('0 10 * * *', date)).toBe(false);
    expect(matchesCron('30 9 * * *', date)).toBe(false);
  });

  it('matches day of month', () => {
    const first = new Date('2025-06-01T09:00:00');
    const fifteenth = new Date('2025-06-15T09:00:00');
    expect(matchesCron('0 9 1 * *', first)).toBe(true);
    expect(matchesCron('0 9 1 * *', fifteenth)).toBe(false);
  });

  it('matches month field', () => {
    const june = new Date('2025-06-15T09:00:00');
    const jan = new Date('2025-01-15T09:00:00');
    expect(matchesCron('0 9 15 6 *', june)).toBe(true);
    expect(matchesCron('0 9 15 6 *', jan)).toBe(false);
  });

  it('matches day of week (0=Sun, 6=Sat)', () => {
    // 2025-06-15 is a Sunday (day 0)
    const sunday = new Date('2025-06-15T09:00:00');
    expect(matchesCron('0 9 * * 0', sunday)).toBe(true);
    expect(matchesCron('0 9 * * 1', sunday)).toBe(false);
  });

  it('matches weekdays range (1-5)', () => {
    // 2025-06-16 is Monday (day 1)
    const monday = new Date('2025-06-16T09:00:00');
    // 2025-06-15 is Sunday (day 0)
    const sunday = new Date('2025-06-15T09:00:00');
    expect(matchesCron('0 9 * * 1-5', monday)).toBe(true);
    expect(matchesCron('0 9 * * 1-5', sunday)).toBe(false);
  });

  it('matches comma-separated lists', () => {
    const date = new Date('2025-06-15T09:00:00'); // Sunday
    expect(matchesCron('0 9 * * 0,6', date)).toBe(true); // Sun or Sat
    expect(matchesCron('0 9 * * 1,2,3', date)).toBe(false);
  });

  it('matches step expressions', () => {
    // */15 = every 15 minutes: 0, 15, 30, 45
    expect(matchesCron('*/15 * * * *', new Date('2025-06-15T09:00:00'))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date('2025-06-15T09:15:00'))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date('2025-06-15T09:07:00'))).toBe(false);
  });

  it('matches step with range', () => {
    // 1-5/2 = 1, 3, 5
    const mon = new Date('2025-06-16T09:00:00'); // Monday = 1
    const tue = new Date('2025-06-17T09:00:00'); // Tuesday = 2
    const wed = new Date('2025-06-18T09:00:00'); // Wednesday = 3
    expect(matchesCron('0 9 * * 1-5/2', mon)).toBe(true);
    expect(matchesCron('0 9 * * 1-5/2', tue)).toBe(false);
    expect(matchesCron('0 9 * * 1-5/2', wed)).toBe(true);
  });

  it('throws on invalid expression (wrong field count)', () => {
    expect(() => matchesCron('0 9 * *', new Date())).toThrow('need 5 fields');
    expect(() => matchesCron('0 9 * * * *', new Date())).toThrow('need 5 fields');
  });

  it('throws on out-of-range values', () => {
    expect(() => matchesCron('60 * * * *', new Date())).toThrow('out of range');
    expect(() => matchesCron('* 24 * * *', new Date())).toThrow('out of range');
    expect(() => matchesCron('* * 0 * *', new Date())).toThrow('out of range');
    expect(() => matchesCron('* * * 13 *', new Date())).toThrow('out of range');
    expect(() => matchesCron('* * * * 7', new Date())).toThrow('out of range');
  });

  it('throws on invalid step', () => {
    expect(() => matchesCron('*/0 * * * *', new Date())).toThrow('Invalid step');
  });

  it('throws on non-numeric values', () => {
    expect(() => matchesCron('abc * * * *', new Date())).toThrow();
  });
});

// ── validateCron ─────────────────────────────────────────────────

describe('validateCron', () => {
  it('returns null for valid expressions', () => {
    expect(validateCron('* * * * *')).toBeNull();
    expect(validateCron('0 9 * * 1-5')).toBeNull();
    expect(validateCron('*/15 * * * *')).toBeNull();
    expect(validateCron('0,30 9,17 * * *')).toBeNull();
  });

  it('returns error message for invalid expressions', () => {
    expect(validateCron('bad')).toBeTruthy();
    expect(validateCron('60 * * * *')).toContain('out of range');
    expect(validateCron('* * * * * *')).toContain('need 5 fields');
  });
});

// ── cronToHuman ─────────────────────────────────────────────────

describe('cronToHuman', () => {
  it('formats every-minute expression', () => {
    expect(cronToHuman('* * * * *')).toBe('Every minute');
  });

  it('formats every-N-minutes', () => {
    expect(cronToHuman('*/15 * * * *')).toBe('Every 15 min');
    expect(cronToHuman('*/5 * * * *')).toBe('Every 5 min');
  });

  it('formats daily at time', () => {
    expect(cronToHuman('0 9 * * *')).toBe('Daily at 09:00');
    expect(cronToHuman('30 17 * * *')).toBe('Daily at 17:30');
  });

  it('formats weekdays at time', () => {
    expect(cronToHuman('0 9 * * 1-5')).toBe('Weekdays at 09:00');
  });

  it('formats weekends at time', () => {
    expect(cronToHuman('0 10 * * 0,6')).toBe('Weekends at 10:00');
  });

  it('formats monthly 1st', () => {
    expect(cronToHuman('0 8 1 * *')).toBe('Monthly 1st at 08:00');
  });

  it('formats specific weekday', () => {
    expect(cronToHuman('0 9 * * 1')).toBe('Mon at 09:00');
    expect(cronToHuman('0 9 * * 5')).toBe('Fri at 09:00');
  });

  it('formats minute-of-hour expressions', () => {
    expect(cronToHuman('30 * * * *')).toBe('Minute 30, every hour');
  });

  it('returns raw expression for complex patterns', () => {
    const expr = '0 9 1,15 * *';
    expect(cronToHuman(expr)).toBe(expr);
  });

  it('returns raw expression for invalid field count', () => {
    expect(cronToHuman('bad')).toBe('bad');
  });
});
