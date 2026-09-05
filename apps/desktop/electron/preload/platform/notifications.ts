/// <reference lib="dom" />
/**
 * Preload bridge for the notifications IPC namespace.
 *
 * The desktop renderer reads the same feed the gateway serves.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  ListNotificationsOptions,
  NotificationEntry,
} from '@electron/features/notifications/types';

export const notificationsBridge = {
  /** Feed entries, newest first. */
  list: (options?: ListNotificationsOptions): Promise<NotificationEntry[]> =>
    ipcRenderer.invoke(IpcChannels.notifications.list, options),

  /** Mark entries read. Resolves with the ids that changed. */
  markRead: (ids: string[]): Promise<string[]> =>
    ipcRenderer.invoke(IpcChannels.notifications.markRead, ids),

  /** How many entries are unread. */
  unreadCount: (): Promise<number> =>
    ipcRenderer.invoke(IpcChannels.notifications.unreadCount),

  /** Listen for a new entry. */
  onAdded: (callback: (entry: NotificationEntry) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: NotificationEntry) =>
      callback(entry);
    ipcRenderer.on(IpcChannels.notifications.added, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notifications.added, handler);
    };
  },

  /** Listen for entries being marked read, here or on a phone. */
  onRead: (callback: (data: { ids: string[] }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { ids: string[] }) =>
      callback(data);
    ipcRenderer.on(IpcChannels.notifications.read, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notifications.read, handler);
    };
  },
};
