/**
 * Connected-client housekeeping — authentication scope, per-IP counting
 * and idle disconnection. Split from `gateway/index.ts` to keep it under
 * the 500 LOC rule.
 */

import { WebSocket } from 'ws';
import type { GatewayAuthResult } from '../security/auth';
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
