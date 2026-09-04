/**
 * Notification bridge — carries feed entries to gateway clients.
 *
 * The feed is the single origin. This bridge subscribes to it and pushes
 * each entry to the tokens allowed to see it. A phone that was offline
 * catches up with `list_notifications`, which reads the same feed.
 */

import { getNotificationFeed } from '@electron/features/notifications/feed';
import type { NotificationEntry } from '@electron/features/notifications/types';
import type {
  GatewayNotificationEvent,
  GatewayPushEvent,
} from '../server/protocol-events';

/** What the bridge needs from the gateway to reach clients. */
export interface NotificationEventSink {
  broadcastWorkspaceEvent(workspaceId: string, event: GatewayPushEvent): void;
  broadcastOwnerEvent(event: GatewayPushEvent): void;
  broadcastEvent(event: GatewayPushEvent): void;
}

let unsubscribe: (() => void) | null = null;

/** The wire shape of one feed entry. */
export function toNotificationEvent(entry: NotificationEntry): GatewayNotificationEvent {
  return {
    type: 'notification',
    id: entry.id,
    ts: entry.ts,
    source: entry.source,
    // `type` already names the event, so the severity needs its own key.
    notificationType: entry.type,
    message: entry.message,
    workspaceId: entry.workspaceId,
    read: entry.read,
  };
}

/**
 * Start pushing feed entries. Safe to call more than once.
 *
 * An entry that names a workspace goes to the tokens that reach it. An
 * entry with no workspace goes to owner tokens only, because no scoped
 * token can be shown to have a right to it.
 */
export function registerGatewayNotificationBridge(sink: NotificationEventSink): void {
  unsubscribe?.();

  const feed = getNotificationFeed();

  const stopEntries = feed.subscribe((entry) => {
    const event = toNotificationEvent(entry);
    if (entry.workspaceId) sink.broadcastWorkspaceEvent(entry.workspaceId, event);
    else sink.broadcastOwnerEvent(event);
  });

  // An id is a bare UUID and names no workspace, so it carries nothing a
  // scoped token should not see. Every client gets the ids and clears
  // whatever it holds; ids it never had mean nothing to it.
  const stopReads = feed.subscribeRead((ids) => {
    sink.broadcastEvent({ type: 'notifications_read', ids, ts: Date.now() });
  });

  unsubscribe = () => {
    stopEntries();
    stopReads();
  };
}

/** Test seam. Stops pushing feed entries. */
export function resetGatewayNotificationBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
}
