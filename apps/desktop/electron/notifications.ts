/**
 * Desktop notification system for Sero.
 *
 * Provides native macOS notifications via Electron's Notification API,
 * compatible with the Pi SDK's `ctx.ui.notify(message, type)` interface.
 *
 * Also forwards notifications to the renderer via IPC so the UI can
 * show in-app toasts in the future.
 */

import { Notification, BrowserWindow } from 'electron';
import { IpcChannels } from '../src/types/ipc';

export type NotificationType = 'info' | 'warning' | 'error';

export interface SeroNotification {
  message: string;
  type: NotificationType;
  source?: string;
  timestamp: string;
}

const TYPE_PREFIXES: Record<NotificationType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

/**
 * Show a desktop notification and forward to the renderer.
 *
 * This is the single entry point for all extension notifications in Sero.
 * Called by the ExtensionUIContext's `notify()` implementation.
 */
export function showNotification(
  message: string,
  type: NotificationType = 'info',
  source?: string,
): void {
  // ── Desktop notification ───────────────────────────────

  if (Notification.isSupported()) {
    const prefix = TYPE_PREFIXES[type];
    const title = source ? `Sero — ${source}` : 'Sero';

    new Notification({
      title,
      body: `${prefix} ${message}`,
      silent: type === 'info',
    }).show();
  }

  // ── Forward to renderer (for future in-app toasts) ─────

  const event: SeroNotification = {
    message,
    type,
    source,
    timestamp: new Date().toISOString(),
  };

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.notification, event);
  }
}
