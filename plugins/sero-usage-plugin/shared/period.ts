// Period boundary math, shared by the extension aggregator and the UI
// (trend chart range filtering). All boundaries are local time; weeks
// start on Monday per docs/specs/sero-usage-plugin-spec.md §2.5.

import type { PeriodKey } from './types';

export interface PeriodBoundaries {
  /** Local midnight today, epoch ms. */
  todayMs: number;
  /** Monday 00:00 of the current week, epoch ms. */
  weekStartMs: number;
  /** Monday 00:00 of the previous week, epoch ms. */
  lastWeekStartMs: number;
}

export function periodBoundaries(now: Date): PeriodBoundaries {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  const dayOfWeek = startOfWeek.getDay(); // 0 = Sunday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);

  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  return {
    todayMs: startOfToday.getTime(),
    weekStartMs: startOfWeek.getTime(),
    lastWeekStartMs: startOfLastWeek.getTime(),
  };
}

/**
 * Periods a message timestamp belongs to. `allTime` always applies;
 * `lastWeek` and `thisWeek` are mutually exclusive.
 */
export function periodsForTimestamp(timestamp: number, bounds: PeriodBoundaries): PeriodKey[] {
  const periods: PeriodKey[] = ['allTime'];
  if (timestamp <= 0) return periods;
  if (timestamp >= bounds.todayMs) periods.push('today');
  if (timestamp >= bounds.weekStartMs) {
    periods.push('thisWeek');
  } else if (timestamp >= bounds.lastWeekStartMs) {
    periods.push('lastWeek');
  }
  return periods;
}

/** Local-time YYYY-MM-DD key for daily buckets. */
export function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
