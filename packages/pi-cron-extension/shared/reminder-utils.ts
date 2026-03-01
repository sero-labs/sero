/**
 * Reminder utility functions shared between the extension and the UI.
 *
 * Handles fire-time checks, snooze computation, status display,
 * and next-fire-time calculation.
 */

import { matchesCron } from './cron';
import type { Reminder, ReminderStatus } from './types';
import { SNOOZE_OPTIONS } from './types';

// ── Fire-time checks ───────────────────────────────────────────

/**
 * Check whether a reminder should fire right now.
 * Called by the scheduler tick (every 30s).
 */
export function shouldFire(reminder: Reminder, now: Date): boolean {
  if (reminder.status === 'completed' || reminder.status === 'disabled') {
    return false;
  }

  // Snoozed: fire when snooze expires
  if (reminder.status === 'snoozed' && reminder.snoozedUntil) {
    return new Date(reminder.snoozedUntil).getTime() <= now.getTime();
  }

  // Active
  if (reminder.status !== 'active') return false;

  if (reminder.type === 'once' && reminder.fireAt) {
    // One-time: fire if fireAt has passed and hasn't fired yet
    const fireTime = new Date(reminder.fireAt).getTime();
    if (fireTime > now.getTime()) return false;
    // Don't re-fire if already fired for this fireAt
    if (reminder.lastFiredAt) {
      const lastFired = new Date(reminder.lastFiredAt).getTime();
      if (lastFired >= fireTime) return false;
    }
    return true;
  }

  if (reminder.type === 'recurring' && reminder.schedule) {
    // Recurring: use cron matching (same as cron jobs)
    try {
      if (!matchesCron(reminder.schedule, now)) return false;
    } catch {
      return false;
    }
    // Don't fire twice in the same minute
    if (reminder.lastFiredAt) {
      const last = new Date(reminder.lastFiredAt);
      if (
        last.getFullYear() === now.getFullYear() &&
        last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate() &&
        last.getHours() === now.getHours() &&
        last.getMinutes() === now.getMinutes()
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
}

// ── Snooze computation ─────────────────────────────────────────

/**
 * Compute the snoozedUntil datetime for a given snooze option.
 * Returns an ISO string.
 */
export function computeSnoozeUntil(minutes: number): string {
  if (minutes === -1) {
    // Special: "Tomorrow 9am"
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow.toISOString();
  }
  const until = new Date(Date.now() + minutes * 60_000);
  return until.toISOString();
}

/**
 * Apply snooze to a reminder, returning the updated reminder.
 */
export function snoozeReminder(
  reminder: Reminder,
  minutes: number,
): Reminder {
  return {
    ...reminder,
    status: 'snoozed' as ReminderStatus,
    snoozedUntil: computeSnoozeUntil(minutes),
  };
}

// ── Post-fire status ───────────────────────────────────────────

/**
 * Compute the new status after a reminder fires.
 */
export function statusAfterFire(reminder: Reminder): Reminder {
  const now = new Date().toISOString();

  if (reminder.type === 'once') {
    return {
      ...reminder,
      status: 'completed',
      lastFiredAt: now,
      completedAt: now,
      snoozedUntil: undefined,
    };
  }

  // Recurring: stays active, clear snooze
  return {
    ...reminder,
    status: 'active',
    lastFiredAt: now,
    snoozedUntil: undefined,
  };
}

// ── Display helpers ────────────────────────────────────────────

const STATUS_LABELS: Record<ReminderStatus, string> = {
  active: '🔔 Active',
  snoozed: '💤 Snoozed',
  completed: '✅ Done',
  disabled: '⏸ Disabled',
};

export function statusLabel(status: ReminderStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Get a human-readable description of when the reminder will fire next.
 */
export function nextFireDescription(reminder: Reminder): string {
  if (reminder.status === 'completed') return 'Completed';
  if (reminder.status === 'disabled') return 'Disabled';

  if (reminder.status === 'snoozed' && reminder.snoozedUntil) {
    return `Snoozed until ${formatDateTime(reminder.snoozedUntil)}`;
  }

  if (reminder.type === 'once' && reminder.fireAt) {
    const fireTime = new Date(reminder.fireAt);
    if (fireTime.getTime() <= Date.now()) return 'Due now';
    return formatDateTime(reminder.fireAt);
  }

  if (reminder.type === 'recurring' && reminder.schedule) {
    return `Recurring: ${reminder.schedule}`;
  }

  return 'Unknown';
}

/** Format an ISO string as a friendly datetime. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();

  // If within 24 hours, show relative
  if (Math.abs(diffMs) < 86_400_000) {
    if (diffMs < 0) return formatTimeAgo(-diffMs);
    return `in ${formatTimeAgo(diffMs)}`;
  }

  // Otherwise show date + time
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Generate a short unique ID for reminders (8 chars).
 */
export function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Get snooze options with their labels and minute values.
 */
export function getSnoozeOptions(): Array<{ label: string; minutes: number }> {
  return [...SNOOZE_OPTIONS];
}
