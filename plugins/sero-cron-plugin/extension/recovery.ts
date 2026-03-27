/**
 * Missed job/reminder recovery on scheduler start.
 *
 * When Sero wasn't running, cron jobs and reminders can be missed.
 * This module detects missed items and either runs them (jobs) or
 * shows a notification (reminders).
 *
 * Recovery is opt-in per job/reminder via `runIfMissed` / `recoverIfMissed`.
 * Jobs are only recovered if missed since midnight (00:00) of the current day.
 */

import type { CronJob, CronState, Reminder, NotificationSettings } from '../shared/types';
import { matchesCron } from '../shared/cron';
import { info, warn } from './logger';

// ── Missed window computation ──────────────────────────────────

/**
 * Compute the recovery window: from max(lastShutdown, today 00:00) to now.
 * Returns null if no recovery is needed (e.g. shutdown was today and recent).
 */
export function computeRecoveryWindow(
  lastShutdown: string | undefined,
  now: Date,
): { from: Date; to: Date } | null {
  if (!lastShutdown) return null;

  const shutdownTime = new Date(lastShutdown);
  if (isNaN(shutdownTime.getTime())) return null;

  // Only recover for same-day misses (since midnight)
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const windowStart = shutdownTime.getTime() > midnight.getTime()
    ? shutdownTime
    : midnight;

  // If the window is less than 2 minutes, skip (scheduler was just restarted)
  if (now.getTime() - windowStart.getTime() < 2 * 60_000) return null;

  return { from: windowStart, to: now };
}

// ── Cron job recovery ──────────────────────────────────────────

/**
 * Check if a cron schedule would have matched at any minute in the window.
 * Returns true on first match (we only need to know if it was missed at all).
 */
export function wouldHaveMatched(
  schedule: string,
  from: Date,
  to: Date,
): boolean {
  // Iterate minute by minute through the window
  const cursor = new Date(from);
  // Align to next full minute
  cursor.setSeconds(0, 0);
  if (cursor.getTime() < from.getTime()) {
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  const toTime = to.getTime();
  while (cursor.getTime() < toTime) {
    try {
      if (matchesCron(schedule, cursor)) return true;
    } catch {
      return false;
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return false;
}

/**
 * Find cron jobs that were missed during the recovery window.
 * Only returns jobs with `runIfMissed: true` that are not disabled.
 */
export function findMissedJobs(
  jobs: CronJob[],
  window: { from: Date; to: Date },
): CronJob[] {
  const missed: CronJob[] = [];
  for (const job of jobs) {
    if (job.disabled || !job.runIfMissed) continue;
    if (wouldHaveMatched(job.schedule, window.from, window.to)) {
      missed.push(job);
    }
  }
  return missed;
}

// ── Reminder recovery ──────────────────────────────────────────

export interface MissedReminder {
  reminder: Reminder;
  /** Approximate time the reminder should have fired. */
  missedAt: Date;
}

/**
 * Find reminders that were missed during the recovery window.
 * Only returns reminders with `recoverIfMissed: true`.
 */
export function findMissedReminders(
  reminders: Reminder[],
  window: { from: Date; to: Date },
): MissedReminder[] {
  const missed: MissedReminder[] = [];

  for (const r of reminders) {
    if (!r.recoverIfMissed) continue;
    if (r.status === 'completed' || r.status === 'disabled') continue;

    // One-time reminders: check if fireAt falls in the window
    if (r.type === 'once' && r.fireAt && !r.lastFiredAt) {
      const fireTime = new Date(r.fireAt);
      if (
        fireTime.getTime() >= window.from.getTime() &&
        fireTime.getTime() < window.to.getTime()
      ) {
        missed.push({ reminder: r, missedAt: fireTime });
      }
      continue;
    }

    // Recurring reminders: check if cron would have matched
    if (r.type === 'recurring' && r.schedule) {
      const cursor = new Date(window.from);
      cursor.setSeconds(0, 0);
      if (cursor.getTime() < window.from.getTime()) {
        cursor.setMinutes(cursor.getMinutes() + 1);
      }
      const toTime = window.to.getTime();
      while (cursor.getTime() < toTime) {
        try {
          if (matchesCron(r.schedule, cursor)) {
            missed.push({ reminder: r, missedAt: new Date(cursor) });
            break; // One notification per reminder is enough
          }
        } catch {
          break;
        }
        cursor.setMinutes(cursor.getMinutes() + 1);
      }
    }
  }

  return missed;
}

// ── Recovery orchestrator ──────────────────────────────────────

export interface RecoveryResult {
  missedJobs: CronJob[];
  missedReminders: MissedReminder[];
}

/**
 * Detect all missed jobs and reminders based on the scheduler shutdown time.
 * Does NOT execute anything — the caller decides what to do with the results.
 */
export function detectMissedItems(state: CronState): RecoveryResult {
  const now = new Date();
  const window = computeRecoveryWindow(state.lastSchedulerShutdown, now);

  if (!window) {
    return { missedJobs: [], missedReminders: [] };
  }

  info('recovery:check', {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    windowMinutes: Math.round((window.to.getTime() - window.from.getTime()) / 60_000),
  });

  const missedJobs = findMissedJobs(state.jobs, window);
  const missedReminders = findMissedReminders(state.reminders, window);

  if (missedJobs.length > 0 || missedReminders.length > 0) {
    info('recovery:found', {
      missedJobs: missedJobs.map((j) => j.name),
      missedReminders: missedReminders.map((m) => m.reminder.title),
    });
  }

  return { missedJobs, missedReminders };
}
