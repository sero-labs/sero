/**
 * Connected-client housekeeping — authentication scope, per-IP counting
 * and idle disconnection. Split from `gateway/index.ts` to keep it under
 * the 500 LOC rule.
 */

import { WebSocket } from 'ws';
import type { GatewayAuth, GatewayAuthResult } from '../security/auth';
import type { GatewayConnectRequest } from './protocol';
import type { RateLimiter } from '../security/rate-limiter';
import { sendResponse } from './request-handler';
import { hasWorkspaceAccess } from './access-control';
import { pendingChoicesFor } from '../bridge/choice-bridge';
import type { ConnectedClient } from '..';

/**
 * Record what a successful authentication grants.
 *
 * Every earlier grant is dropped. A client that authenticates again must
 * earn its session and artifact access again, so an old token's reach
 * cannot survive into a new one.
 */
export function applyAuthResult(client: ConnectedClient, result: GatewayAuthResult): void {
  client.authenticated = true;
  client.isMasterAuth = result.type === 'master';
  client.tokenId = result.tokenId;
  client.authorizedWorkspaceIds = result.authorizedWorkspaceIds
    ? new Set(result.authorizedWorkspaceIds)
    : null;
  client.authorizedSessions.clear();
  client.authorizedArtifacts.clear();
  client.subscribedSessions.clear();
}

/** How many connections come from one IP address. */
export function countConnectionsFromIp(
  clients: Map<WebSocket, ConnectedClient>,
  ip: string,
): number {
  let count = 0;
  for (const [, client] of clients) {
    if (client.remoteIp === ip) count += 1;
  }
  return count;
}

/**
 * Close authenticated connections that went quiet for too long.
 * An unauthenticated connection is left to the handshake timeout.
 */
export function closeIdleConnections(
  clients: Map<WebSocket, ConnectedClient>,
  idleTimeoutMs: number,
): void {
  const now = Date.now();
  for (const [ws, client] of clients) {
    if (!client.authenticated) continue;
    if (now - client.lastActivity > idleTimeoutMs) {
      console.log(`[gateway] Closing idle connection: ${client.clientType} (${client.clientId})`);
      ws.close(4008, 'Idle timeout');
      clients.delete(ws);
    }
  }
}

/**
 * Replay the choices already waiting, so a client that connects after a
 * question appeared still sees it.
 */
export function sendPendingChoices(ws: WebSocket, client: ConnectedClient): void {
  const canReach = (workspaceId: string | null) =>
    workspaceId === null
      ? client.authorizedWorkspaceIds === null
      : hasWorkspaceAccess(client, workspaceId);

  for (const event of pendingChoicesFor(canReach)) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }
}

/**
 * Answer a `connect` request: rate limit, validate, then record what the
 * token grants. Returns false when the client was refused and closed.
 */
export function authenticateClient(
  ws: WebSocket,
  client: ConnectedClient,
  request: GatewayConnectRequest,
  auth: GatewayAuth,
  limiter: RateLimiter,
): boolean {
  if (!limiter.check(client.remoteIp)) {
    console.warn(`[gateway] Auth rate-limited: ${client.remoteIp}`);
    sendResponse(ws, {
      type: 'error',
      requestType: 'connect',
      message: 'Too many authentication attempts. Try again later.',
    });
    ws.close(4029, 'Rate limited');
    return false;
  }

  const authResult = auth.validate(request.token);
  if (!authResult) {
    console.warn(
      `[gateway] Auth failed: ${client.remoteIp} (client type: ${request.clientType})`,
    );
    sendResponse(ws, {
      type: 'error',
      requestType: 'connect',
      message: 'Invalid authentication token',
    });
    ws.close(4003, 'Authentication failed');
    return false;
  }

  // Successful auth — this IP starts fresh.
  limiter.reset(client.remoteIp);

  applyAuthResult(client, authResult);
  client.clientType = request.clientType;
  if (request.clientId) client.clientId = request.clientId;
  console.log(
    `[gateway] Client authenticated: ${client.clientType} (${client.clientId}) from ${client.remoteIp}`,
  );
  sendResponse(ws, { type: 'ok', requestType: 'connect' });
  sendPendingChoices(ws, client);
  return true;
}
