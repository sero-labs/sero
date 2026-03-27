/**
 * Reminder notification delivery.
 *
 * Emits 'sero:notify' on the Pi SDK EventBus. The Sero host's
 * extension factory listens for these events and routes them to
 * Electron's native Notification API.
 *
 * This keeps the extension decoupled from Electron — it only uses
 * the Pi SDK's standard EventBus, which also works in Pi CLI
 * (where the host can choose its own notification strategy).
 *
 * Email channel is accepted but not yet implemented — logs a warning
 * and falls back to desktop notification.
 */

import type { Reminder, ReminderChannel, NotificationSettings } from '../shared/types';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../shared/types';
import { info, warn } from './logger';

// ── EventBus emitter ───────────────────────────────────────────

/** Stored reference to pi.events.emit — set by initNotifier(). */
let emitFn: ((channel: string, data: unknown) => void) | null = null;

/**
 * Wire up the notification emitter. Call once from the extension's
 * default export with `initNotifier(pi.events.emit.bind(pi.events))`.
 */
export function initNotifier(
  emit: (channel: string, data: unknown) => void,
): void {
  emitFn = emit;
  info('notifier:init', { method: 'event-bus' });
}

// ── Desktop notification ───────────────────────────────────────

function showDesktopNotification(
  title: string,
  body: string,
  settings: NotificationSettings,
): void {
  if (emitFn) {
    emitFn('sero:notify', {
      message: body !== title ? body : title,
      subtitle: body !== title ? title : undefined,
      type: 'info',
      source: '🔔 Reminder',
      sound: settings.soundEnabled ? settings.soundName : false,
    });
    info('notifier:desktop', { title, sound: settings.soundEnabled ? settings.soundName : 'off' });
    return;
  }

  // Fallback: console only (visible in /tmp/sero-electron.log)
  console.log(`[reminder] 🔔 ${title}: ${body}`);
  warn('notifier:no-emitter', {
    title,
    hint: 'initNotifier() not called — call from extension setup',
  });
}

// ── Email notification (stub) ──────────────────────────────────

function showEmailNotification(
  title: string,
  body: string,
  settings: NotificationSettings,
): void {
  warn('notifier:email-not-implemented', { title });
  showDesktopNotification(title, `(email pending) ${body}`, settings);
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Fire a notification when a cron job completes.
 */
export function notifyJobComplete(
  jobName: string,
  ok: boolean,
  durationMs: number,
  settings?: NotificationSettings,
): void {
  if (!emitFn) return;
  const effectiveSettings = settings ?? DEFAULT_NOTIFICATION_SETTINGS;
  const status = ok ? '✅' : '❌';
  const secs = (durationMs / 1000).toFixed(1);
  emitFn('sero:notify', {
    message: `${status} Job "${jobName}" ${ok ? 'completed' : 'failed'} (${secs}s)`,
    type: ok ? 'info' : 'error',
    source: 'Cron',
    sound: effectiveSettings.soundEnabled ? effectiveSettings.soundName : false,
  });
  info('notifier:job-complete', { jobName, ok });
}

/**
 * Fire a notification for a reminder using its configured channel.
 * Pass notification settings from CronState to control sound.
 */
export function notifyReminder(
  reminder: Reminder,
  settings?: NotificationSettings,
): void {
  const effectiveSettings = settings ?? DEFAULT_NOTIFICATION_SETTINGS;
  const body = reminder.notes
    ? `${reminder.title}\n${reminder.notes}`
    : reminder.title;

  const channel: ReminderChannel = reminder.channel ?? 'notification';

  switch (channel) {
    case 'email':
      showEmailNotification(reminder.title, body, effectiveSettings);
      break;
    case 'notification':
    default:
      showDesktopNotification(reminder.title, body, effectiveSettings);
      break;
  }
}
