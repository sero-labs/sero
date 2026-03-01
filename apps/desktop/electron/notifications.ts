/**
 * Desktop notification system for Sero.
 *
 * Provides native macOS notifications via Electron's Notification API,
 * compatible with the Pi SDK's `ctx.ui.notify(message, type)` interface.
 */

import { Notification } from 'electron';

export type NotificationType = 'info' | 'warning' | 'error';

const TYPE_PREFIXES: Record<NotificationType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

/**
 * Show a native desktop notification.
 *
 * This is the single entry point for all extension notifications in Sero.
 * Called by the ExtensionUIContext's `notify()` implementation.
 */
export function showNotification(
  message: string,
  type: NotificationType = 'info',
  source?: string,
): void {
  if (!Notification.isSupported()) return;

  const prefix = TYPE_PREFIXES[type];
  const title = source ? `Sero — ${source}` : 'Sero';

  new Notification({
    title,
    body: `${prefix} ${message}`,
    silent: type === 'info',
  }).show();
}
