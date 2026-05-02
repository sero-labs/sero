import type { CronState, Reminder, ReminderChannel } from './types';
import { MAX_COMPLETED_REMINDERS } from './types';
import { snoozeReminder } from './reminder-utils';

const UNSUPPORTED_EMAIL_MESSAGE =
  'Error: email channel is not yet supported. Use "notification" (desktop) instead.';

export type ReminderChannelValidation =
  | { ok: true; channel: Extract<ReminderChannel, 'notification'> }
  | { ok: false; error: string };

export function validateReminderChannel(
  channel?: string,
): ReminderChannelValidation {
  if (channel === 'email') {
    return { ok: false, error: UNSUPPORTED_EMAIL_MESSAGE };
  }
  return { ok: true, channel: 'notification' };
}

export function normalizeReminderChannel(
  channel: ReminderChannel | undefined,
): Extract<ReminderChannel, 'notification'> {
  return channel === 'notification' ? 'notification' : 'notification';
}

export function upsertReminder(state: CronState, reminder: Reminder): void {
  const reminders = ensureReminders(state);
  const index = reminders.findIndex((entry) => entry.id === reminder.id);
  if (index >= 0) {
    reminders[index] = reminder;
    return;
  }
  reminders.push(reminder);
}

export function removeReminderById(
  state: CronState,
  id: string,
): Reminder | null {
  const reminders = ensureReminders(state);
  const index = reminders.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  return reminders.splice(index, 1)[0] ?? null;
}

export function snoozeReminderById(
  state: CronState,
  id: string,
  minutes: number,
): Reminder | null {
  const reminders = ensureReminders(state);
  const index = reminders.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const updated = snoozeReminder(reminders[index], minutes);
  reminders[index] = updated;
  return updated;
}

export function completeReminderById(
  state: CronState,
  id: string,
  completedAt = new Date().toISOString(),
): Reminder | null {
  const reminders = ensureReminders(state);
  const index = reminders.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  const updated: Reminder = {
    ...reminders[index],
    status: 'completed',
    completedAt,
    snoozedUntil: undefined,
  };
  reminders[index] = updated;
  pruneCompletedReminders(state);
  return updated;
}

export function toggleReminderDisabledState(
  state: CronState,
  id: string,
  disable: boolean,
): Reminder | null {
  const reminders = ensureReminders(state);
  const index = reminders.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  const updated: Reminder = {
    ...reminders[index],
    status: disable ? 'disabled' : 'active',
    snoozedUntil: undefined,
  };
  reminders[index] = updated;
  return updated;
}

export function pruneCompletedReminders(state: CronState): void {
  const reminders = ensureReminders(state);
  const completed = reminders.filter((entry) => entry.status === 'completed');
  if (completed.length <= MAX_COMPLETED_REMINDERS) return;

  completed.sort(
    (left, right) =>
      new Date(right.completedAt ?? 0).getTime()
      - new Date(left.completedAt ?? 0).getTime(),
  );
  const idsToRemove = new Set(
    completed
      .slice(MAX_COMPLETED_REMINDERS)
      .map((entry) => entry.id),
  );
  state.reminders = reminders.filter((entry) => !idsToRemove.has(entry.id));
}

function ensureReminders(state: CronState): Reminder[] {
  if (!state.reminders) {
    state.reminders = [];
  }
  return state.reminders;
}
