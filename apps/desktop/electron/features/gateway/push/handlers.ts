/**
 * Push gateway handlers — a browser subscribes, unsubscribes, or asks
 * whether push is available at all.
 *
 * A subscription is filed under the token that made it, with that
 * token's workspace scope frozen in. A push then reaches the same
 * workspaces the socket does, and a revoked token's phone goes quiet.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from '../server/protocol';
import { makeResponder } from '../server/request-handler';
import type { PushService } from './service';
import type { ConnectedClient } from '..';

/**
 * Handle the push request types.
 * Returns true when the request was handled.
 */
export function routePushRequest(
  ws: WebSocket,
  client: ConnectedClient,
  request: GatewayRequest,
  push: PushService,
): boolean {
  if (
    request.type !== 'push_status'
    && request.type !== 'push_subscribe'
    && request.type !== 'push_unsubscribe'
  ) {
    return false;
  }

  const respond = makeResponder(ws, request.requestId);

  if (request.type === 'push_status') {
    respond({
      type: 'ok',
      requestType: 'push_status',
      data: { enabled: push.enabled, publicKey: push.publicKey },
    });
    return true;
  }

  if (!push.enabled) {
    respond({
      type: 'error',
      requestType: request.type,
      message: 'Push is not available on this machine.',
    });
    return true;
  }

  if (request.type === 'push_unsubscribe') {
    respond({
      type: 'ok',
      requestType: 'push_unsubscribe',
      data: { removed: push.unsubscribe(request.endpoint) },
    });
    return true;
  }

  push.subscribe(
    client.tokenId,
    client.authorizedWorkspaceIds === null ? null : [...client.authorizedWorkspaceIds],
    { endpoint: request.endpoint, p256dh: request.p256dh, auth: request.auth },
  );
  respond({ type: 'ok', requestType: 'push_subscribe', data: { subscribed: true } });
  return true;
}
