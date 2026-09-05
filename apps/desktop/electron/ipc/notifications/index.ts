/**
 * Notification feed IPC.
 *
 * The desktop renderer reads the same feed the gateway serves, so a
 * notification looks the same on the desktop and on a phone.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { getNotificationFeed } from '@electron/features/notifications/feed';
import type {
  ListNotificationsOptions,
  NotificationEntry,
} from '@electron/features/notifications/types';
import { broadcastToWindows } from '../lib/window-broadcast';

export function registerNotificationHandlers(): void {
  const feed = getNotificationFeed();

  feed.subscribe((entry) => {
    broadcastToWindows(IpcChannels.notifications.added, entry);
  });

  feed.subscribeRead((ids) => {
    broadcastToWindows(IpcChannels.notifications.read, { ids });
  });

  ipcMain.handle(
    IpcChannels.notifications.list,
    async (_event, options?: ListNotificationsOptions): Promise<NotificationEntry[]> =>
      feed.list(options ?? {}),
  );

  ipcMain.handle(
    IpcChannels.notifications.markRead,
    async (_event, ids: string[]): Promise<string[]> => feed.markRead(ids),
  );

  ipcMain.handle(
    IpcChannels.notifications.unreadCount,
    async (): Promise<number> => feed.unreadCount(),
  );
}
