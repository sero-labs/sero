/**
 * Push-event fan-out to connected gateway clients. Split from
 * gateway/index.ts to keep it under the 500-LOC rule.
 */

import { WebSocket } from 'ws';
import {
  authorizeArtifactFromSession,
  hasSessionAccess,
  hasWorkspaceAccess,
} from './access-control';
import { toDevServerChangedEvent } from './devserver-proxy';
import type { GatewayPushEvent } from './protocol';
import type { GatewayDevServerChange } from './types';
import type { ConnectedClient } from '../index';

function authorizeEventArtifacts(client: ConnectedClient, event: GatewayPushEvent): void {
  if (event.type === 'artifact_added') {
    authorizeArtifactFromSession(client, event.sessionId, event.artifactId);
  }
}

/** Push an event to all clients subscribed to (and authorized for) a session. */
export function pushSessionEvent(
  clients: Map<WebSocket, ConnectedClient>,
  sessionId: string,
  event: GatewayPushEvent,
): void {
  const payload = JSON.stringify(event);
  for (const [ws, client] of clients) {
    if (!client.authenticated || !client.subscribedSessions.has(sessionId)) {
      continue;
    }
    if (!hasSessionAccess(client, sessionId)) {
      continue;
    }
    authorizeEventArtifacts(client, event);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/** Push an event to authenticated clients that are authorized for its session. */
export function broadcastGatewayEvent(
  clients: Map<WebSocket, ConnectedClient>,
  event: GatewayPushEvent,
): void {
  const payload = JSON.stringify(event);
  const sessionId = 'sessionId' in event ? event.sessionId : null;
  for (const [ws, client] of clients) {
    if (!client.authenticated) continue;
    if (sessionId && !hasSessionAccess(client, sessionId)) continue;
    authorizeEventArtifacts(client, event);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Push an event to every client whose token can reach `workspaceId`.
 *
 * Use this, not `broadcastGatewayEvent`, for any event that names a
 * workspace. `broadcastGatewayEvent` filters on `hasSessionAccess`,
 * which only passes for sessions the client has already listed — so a
 * session created after the client connected would be filtered out.
 */
export function broadcastWorkspaceEvent(
  clients: Map<WebSocket, ConnectedClient>,
  workspaceId: string,
  event: GatewayPushEvent,
): void {
  const payload = JSON.stringify(event);
  for (const [ws, client] of clients) {
    if (!client.authenticated) continue;
    if (!hasWorkspaceAccess(client, workspaceId)) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Push a dev server change to clients authorized for the affected
 * workspace. Master-token clients see everything; scoped clients
 * only see workspaces in their authorization set.
 */
export function broadcastDevServerChange(
  clients: Map<WebSocket, ConnectedClient>,
  change: GatewayDevServerChange,
): void {
  const payload = JSON.stringify(toDevServerChangedEvent(change));
  for (const [ws, client] of clients) {
    if (!client.authenticated) continue;
    if (!hasWorkspaceAccess(client, change.workspaceId)) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
