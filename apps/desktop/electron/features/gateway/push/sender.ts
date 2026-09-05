/**
 * Sends a Web Push message to the phones that asked for one.
 *
 * A push travels through the browser vendor's push service, which is
 * outside the tailnet. So the payload carries no message content: only
 * what the phone needs to show a line and open the right place. The
 * details are fetched over the tailnet when the person taps.
 *
 * A push service answers 404 or 410 for a subscription the browser threw
 * away. Those are pruned, because they never come back.
 */

import webpush from 'web-push';
import {
  subscriptionReaches,
  type PushSubscriptionRecord,
  type PushSubscriptionStore,
} from './subscriptions';

/** What a phone is told. No message text, by design. */
export interface PushPayload {
  /** The line shown on the lock screen. */
  title: string;
  /** Which kind of event this was, for the phone's own grouping. */
  kind: 'notification' | 'turn_complete' | 'awaiting_input';
  /** Where tapping should land, as a path in the web client. */
  path: string;
  /** The workspace this came from, when it names one. */
  workspaceId?: string;
}

/** Sending stopped after this long, so one dead endpoint blocks nothing. */
const SEND_TIMEOUT_MS = 10_000;

/** Which endpoints not to send to: the ones already watching. */
export type ConnectedTokenIds = () => Set<string>;

function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: unknown })?.statusCode;
  return status === 404 || status === 410;
}

/**
 * Push one payload to every subscription that may see it.
 *
 * A token with a client already connected is skipped: that client got
 * the event over the socket, and a second copy on the lock screen is
 * noise. A token that `tokenIsLive` no longer vouches for is skipped
 * and its subscriptions dropped: expiry is checked here, at send time,
 * not only when the token list is next pruned.
 *
 * Returns how many phones were sent to.
 */
export async function sendPush(
  store: PushSubscriptionStore,
  payload: PushPayload,
  connectedTokenIds: Set<string>,
  tokenIsLive: (tokenId: string) => boolean = () => true,
): Promise<number> {
  const targets = store
    .list()
    .filter((s) => {
      if (tokenIsLive(s.tokenId)) return true;
      store.removeForToken(s.tokenId);
      return false;
    })
    .filter((s) => !connectedTokenIds.has(s.tokenId))
    .filter((s) => subscriptionReaches(s, payload.workspaceId));

  if (targets.length === 0) return 0;

  const body = JSON.stringify(payload);
  const results = await Promise.all(
    targets.map((target) => sendOne(store, target, body)),
  );

  return results.filter(Boolean).length;
}

async function sendOne(
  store: PushSubscriptionStore,
  target: PushSubscriptionRecord,
  body: string,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      body,
      { TTL: 300, timeout: SEND_TIMEOUT_MS },
    );
    return true;
  } catch (err) {
    if (isGone(err)) {
      store.remove(target.endpoint);
      return false;
    }
    console.error('[push] Send failed:', err);
    return false;
  }
}
