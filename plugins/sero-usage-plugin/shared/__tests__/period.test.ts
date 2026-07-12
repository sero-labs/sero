import { describe, expect, it } from 'vitest';

import { dateKey, periodBoundaries, periodsForTimestamp } from '../period';

// Fixed reference: Wednesday 2026-07-08, 15:30 local time.
const NOW = new Date(2026, 6, 8, 15, 30);

describe('periodBoundaries', () => {
  it('computes local midnight, Monday week start, and previous Monday', () => {
    const bounds = periodBoundaries(NOW);
    expect(new Date(bounds.todayMs)).toEqual(new Date(2026, 6, 8, 0, 0, 0, 0));
    expect(new Date(bounds.weekStartMs)).toEqual(new Date(2026, 6, 6, 0, 0, 0, 0));
    expect(new Date(bounds.lastWeekStartMs)).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0));
  });

  it('treats Sunday as the last day of the week (Monday start)', () => {
    const sunday = new Date(2026, 6, 12, 10, 0);
    const bounds = periodBoundaries(sunday);
    expect(new Date(bounds.weekStartMs)).toEqual(new Date(2026, 6, 6, 0, 0, 0, 0));
  });
});

describe('periodsForTimestamp', () => {
  const bounds = periodBoundaries(NOW);

  it('assigns a message this morning to today, thisWeek, allTime', () => {
    const ts = new Date(2026, 6, 8, 9, 0).getTime();
    expect(periodsForTimestamp(ts, bounds)).toEqual(['allTime', 'today', 'thisWeek']);
  });

  it('assigns a message earlier this week to thisWeek but not today', () => {
    const ts = new Date(2026, 6, 6, 9, 0).getTime();
    expect(periodsForTimestamp(ts, bounds)).toEqual(['allTime', 'thisWeek']);
  });

  it('assigns last week and older messages exclusively', () => {
    const lastWeekTs = new Date(2026, 6, 1, 9, 0).getTime();
    expect(periodsForTimestamp(lastWeekTs, bounds)).toEqual(['allTime', 'lastWeek']);
    const oldTs = new Date(2026, 4, 1, 9, 0).getTime();
    expect(periodsForTimestamp(oldTs, bounds)).toEqual(['allTime']);
  });

  it('assigns missing timestamps to allTime only', () => {
    expect(periodsForTimestamp(0, bounds)).toEqual(['allTime']);
  });
});

describe('dateKey', () => {
  it('formats local YYYY-MM-DD with zero padding', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 11, 31, 0, 0).getTime())).toBe('2026-12-31');
  });
});
