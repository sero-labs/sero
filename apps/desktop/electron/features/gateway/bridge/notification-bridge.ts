/**
 * Notification bridge — carries feed entries to gateway clients.
 *
 * The feed is the single origin. This bridge subscribes to it and pushes
 * each entry to the tokens allowed to see it. A phone that was offline
 * catches up with `list_notifications`, which reads the same feed.
 */

import { getNotificationFeed } from '@electron/features/notifications/feed';
import { currentPushService } from '../push/service';
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
  /** Tokens with a client connected right now. They need no push. */
  connectedTokenIds(): Set<string>;
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

    pushToPhones(entry, sink);
  });

  // An id is a bare UUID and names no workspace, so it carries nothing a
  // scoped token should not see. Every client gets the ids and clears
  // whatever it holds; ids it never had mean nothing to it.
  const stopReads = feed.subscribeRead((ids) => {
    sink.broadcastEvent({ type: 'notifications_read', ids, ts: Date.now() });
  });

  // Removals travel the same way reads do, and for the same reason: the
  // ids are bare UUIDs, so they name nothing a scoped token must not see.
  const stopDismissals = feed.subscribeDismissed((ids) => {
    sink.broadcastEvent({ type: 'notifications_dismissed', ids, ts: Date.now() });
  });

  unsubscribe = () => {
    stopEntries();
    stopReads();
    stopDismissals();
  };
}

/**
 * Send one entry to the phones that are not already watching.
 *
 * The payload carries the source and the workspace, never the message:
 * it travels through a push service outside the tailnet.
 */
function pushToPhones(entry: NotificationEntry, sink: NotificationEventSink): void {
  const push = currentPushService();
  if (!push?.enabled) return;

  void push.push(
    {
      title: `${entry.source} has something for you`,
      kind: 'notification',
      path: entry.workspaceId ? `/?workspace=${encodeURIComponent(entry.workspaceId)}` : '/',
      workspaceId: entry.workspaceId,
    },
    sink.connectedTokenIds(),
  ).catch((err: unknown) => {
    console.error('[push] Could not send a notification:', err);
  });
}

/** Test seam. Stops pushing feed entries. */
export function resetGatewayNotificationBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
}
