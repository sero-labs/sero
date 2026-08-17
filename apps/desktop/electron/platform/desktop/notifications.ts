/**
 * Desktop notification system for Sero.
 *
 * Provides native macOS notifications via Electron's Notification API.
 * Used by the ExtensionUIContext and the 'sero:notify' EventBus channel.
 *
 * Sound names are macOS system sounds from /System/Library/Sounds/:
 *   Glass, Hero, Ping, Pop, Purr, Submarine, Tink, Basso, Blow, Bottle,
 *   Frog, Funk, Morse, Sosumi
 *
 * Persistence (auto-close) on macOS is controlled per-app in:
 *   System Settings > Notifications > Electron (or Sero when packaged)
 *   Set style to "Alerts" for notifications that stay until dismissed.
 */

import { BrowserWindow, Notification } from 'electron';

export type NotificationType = 'info' | 'warning' | 'error';

export interface NotificationOptions {
  /** Notification message body. */
  message: string;
  /** Severity — affects default icon prefix. */
  type?: NotificationType;
  /** Source label shown in the notification title (e.g. "Reminder"). */
  source?: string;
  /**
   * macOS system sound name (e.g. "Glass", "Hero", "Ping").
   * Set to `true` for the default system sound, `false` or omit for silent.
   */
  sound?: string | boolean;
  /**
   * Subtitle line (macOS only), displayed between title and body.
   */
  subtitle?: string;
  /** Run when the user clicks the notification. */
  onClick?: () => void;
}

const TYPE_PREFIXES: Record<NotificationType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

const DEFAULT_SOUND = 'Glass';

/**
 * Show a native desktop notification.
 *
 * Single entry point for all notifications in Sero.
 */
export function showNotification(opts: NotificationOptions): void;
/** @deprecated Use the options-object overload. */
export function showNotification(message: string, type?: NotificationType, source?: string): void;
export function showNotification(
  messageOrOpts: string | NotificationOptions,
  type?: NotificationType,
  source?: string,
): void {
  if (!Notification.isSupported()) return;

  // Normalise to options object
  const opts: NotificationOptions =
    typeof messageOrOpts === 'string'
      ? { message: messageOrOpts, type, source }
      : messageOrOpts;

  const nType = opts.type ?? 'info';
  const prefix = TYPE_PREFIXES[nType];
  const title = opts.source ? `Sero — ${opts.source}` : 'Sero';

  // Resolve sound
  let silent = true;
  let soundName: string | undefined;
  if (opts.sound === true) {
    silent = false;
    soundName = DEFAULT_SOUND;
  } else if (typeof opts.sound === 'string') {
    silent = false;
    soundName = opts.sound;
  }

  const notification = new Notification({
    title,
    subtitle: opts.subtitle,
    body: `${prefix} ${opts.message}`,
    silent,
    ...(soundName ? { sound: soundName } : {}),
  });

  if (opts.onClick) notification.on('click', opts.onClick);
  notification.show();
}

/**
 * Bring Sero to the front. A notification click must land the user in the
 * window, otherwise opening an app behind everything else looks like nothing
 * happened.
 */
export function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
