/**
 * Shared state shape for the Cron app.
 *
 * Single source of truth — both the Pi extension and the Sero web UI
 * read/write a JSON file matching this shape.
 *
 * Global-scoped: state lives at ~/.sero-ui/apps/cron/state.json
 * (shared across all workspaces).
 */

import type { CronJob, CronState as SharedCronState } from '@sero-ai/common';

export type { CronJob } from '@sero-ai/common';

// ── Cron Jobs ──────────────────────────────────────────────────

export interface CronRunResult {
  jobName: string;
  startedAt: string; // ISO string
  durationMs: number;
  ok: boolean;
  error?: string;
  /** Agent response text (extension loading noise stripped). */
  output?: string;
}

// ── Reminders ──────────────────────────────────────────────────

export type ReminderStatus = 'active' | 'snoozed' | 'completed' | 'disabled';
export type ReminderType = 'once' | 'recurring';
export type ReminderChannel = 'notification' | 'email';

export interface Reminder {
  id: string;
  title: string;
  /** Optional extra details / notes */
  notes?: string;
  /** Delivery channel: desktop notification (default) or email */
  channel: ReminderChannel;

  // ── Scheduling ─────────────────────────────────────────
  type: ReminderType;
  /** ISO datetime — when to fire (one-time reminders) */
  fireAt?: string;
  /** 5-field cron expression (recurring reminders) */
  schedule?: string;

  // ── Status ─────────────────────────────────────────────
  status: ReminderStatus;
  /** ISO datetime — snooze expiry (fires again when reached) */
  snoozedUntil?: string;

  // ── History ────────────────────────────────────────────
  createdAt: string;
  /** ISO datetime — last time the notification was fired */
  lastFiredAt?: string;
  /** ISO datetime — when the reminder was completed/dismissed */
  completedAt?: string;
  /**
   * If true, a notification will be shown on scheduler start for reminders
   * that were missed while Sero was not running. Opt-in, defaults to false.
   */
  recoverIfMissed?: boolean;
}

/** Predefined snooze durations in minutes */
export const SNOOZE_OPTIONS = [
  { label: '5 minutes', minutes: 5 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: 'Tomorrow 9am', minutes: -1 }, // special: computed dynamically
] as const;

// ── Notification Settings ──────────────────────────────────────

/** macOS system sounds from /System/Library/Sounds/ */
export const NOTIFICATION_SOUNDS = [
  'Glass', 'Hero', 'Ping', 'Pop', 'Purr', 'Submarine',
  'Tink', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Morse', 'Sosumi',
] as const;

export type NotificationSoundName = (typeof NOTIFICATION_SOUNDS)[number];

export interface NotificationSettings {
  /** Whether to play a sound on reminder notifications */
  soundEnabled: boolean;
  /** macOS sound name (default: "Glass") */
  soundName: NotificationSoundName;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  soundName: 'Glass',
};

// ── Combined State ─────────────────────────────────────────────

export interface CronState extends SharedCronState<Reminder, CronRunResult, NotificationSettings> {}

export const DEFAULT_CRON_STATE: CronState = {
  jobs: [],
  reminders: [],
  schedulerActive: false,
  autostart: false,
  lastTickMinute: '',
  lastRunResults: [],
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
};

/** Maximum number of run results to keep */
export const MAX_RUN_RESULTS = 50;

/** Maximum number of completed reminders to keep */
export const MAX_COMPLETED_REMINDERS = 100;
