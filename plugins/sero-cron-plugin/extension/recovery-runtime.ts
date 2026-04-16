import { statusAfterFire } from '../shared/reminder-utils';
import type { CronState, NotificationSettings, Reminder } from '../shared/types';
import { type MissedReminder, detectMissedItems } from './recovery';
import { info } from './logger';

export interface RecoveryBootstrapResult {
  state: CronState;
  startOpts?: { lastTickMinute: string };
  missedJobNames: string[];
}

interface RecoveryCallbacks {
  notifyReminder(reminder: Reminder, missedAt: Date, settings?: NotificationSettings): void;
}

function cloneState(state: CronState): CronState {
  return JSON.parse(JSON.stringify(state)) as CronState;
}

function currentMinuteKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
}

function applyRecoveredReminder(
  state: CronState,
  missedReminder: MissedReminder,
  notifyReminder: RecoveryCallbacks['notifyReminder'],
): void {
  notifyReminder(missedReminder.reminder, missedReminder.missedAt, state.notificationSettings ?? undefined);
  const idx = state.reminders.findIndex((entry) => entry.id === missedReminder.reminder.id);
  if (idx >= 0) {
    state.reminders[idx] = statusAfterFire(state.reminders[idx]);
  }
}

export function prepareRecoveryBootstrap(
  state: CronState,
  callbacks: RecoveryCallbacks,
): RecoveryBootstrapResult {
  const { missedJobs, missedReminders } = detectMissedItems(state);
  if (missedJobs.length === 0 && missedReminders.length === 0) {
    return { state, missedJobNames: [] };
  }

  const nextState = cloneState(state);
  for (const missedReminder of missedReminders) {
    applyRecoveredReminder(nextState, missedReminder, callbacks.notifyReminder);
  }

  const minuteKey = currentMinuteKey(new Date());
  nextState.lastTickMinute = minuteKey;

  info('recovery:prepared-bootstrap', {
    missedJobs: missedJobs.map((job) => job.name),
    missedReminders: missedReminders.map((entry) => entry.reminder.id),
    lastTickMinute: minuteKey,
  });

  return {
    state: nextState,
    startOpts: { lastTickMinute: minuteKey },
    missedJobNames: missedJobs.map((job) => job.name),
  };
}
