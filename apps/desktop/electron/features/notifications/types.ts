/**
 * Notification feed types, shared by the store, the IPC surface and the
 * gateway. Kept apart from the store so importing the shape costs nothing.
 */

/**
 * Severity, which decides the icon on the toast. Owned by the platform
 * toast module and re-exported here, so the feed and the toast can never
 * disagree about what a severity is.
 */
export type { NotificationType } from '@electron/platform/desktop/notifications';
import type { NotificationType } from '@electron/platform/desktop/notifications';

/** One entry in the feed. */
export interface NotificationEntry {
  id: string;
  /** Milliseconds since the epoch. */
  ts: number;
  /** Where it came from, for example "Reminder" or a plugin name. */
  source: string;
  type: NotificationType;
  message: string;
  /**
   * The workspace it belongs to. An entry with no workspace is global,
   * and only an owner token can see it.
   */
  workspaceId?: string;
  read: boolean;
}

/** What a caller passes to raise a notification. */
export interface NotifyOptions {
  message: string;
  type?: NotificationType;
  source?: string;
  workspaceId?: string;
  /** macOS sound name, `true` for the default, omitted for silent. */
  sound?: string | boolean;
  /** Subtitle line, macOS only. */
  subtitle?: string;
  /** Run when the user clicks the desktop toast. */
  onClick?: () => void;
  /**
   * Skip the desktop toast and only record the entry. Used for things
   * that are worth a feed row but would be noise as a popup.
   */
  silentOnDesktop?: boolean;
}

export interface ListNotificationsOptions {
  /** Only entries newer than this epoch millisecond value. */
  since?: number;
  limit?: number;
}
