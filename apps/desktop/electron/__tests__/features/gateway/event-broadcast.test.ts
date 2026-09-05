import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { broadcastWorkspaceEvent } from '@electron/features/gateway/server/event-broadcast';
import type { GatewayPushEvent } from '@electron/features/gateway/server/protocol';
import type { ConnectedClient } from '@electron/features/gateway';

interface FakeClient {
  ws: WebSocket;
  client: ConnectedClient;
  sent: string[];
}

/**
 * A client whose token reaches `workspaceIds`, or every workspace when
 * `workspaceIds` is null (the owner token).
 */
function createClient(
  workspaceIds: string[] | null,
  options: { authenticated?: boolean } = {},
): FakeClient {
  const sent: string[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(payload),
  } as unknown as WebSocket;

  const client = {
    ws,
    clientType: 'web',
    clientId: 'client',
    authenticated: options.authenticated ?? true,
    isMasterAuth: workspaceIds === null,
    subscribedSessions: new Set<string>(),
    remoteIp: '127.0.0.1',
    lastActivity: Date.now(),
    authorizedWorkspaceIds: workspaceIds === null ? null : new Set(workspaceIds),
    authorizedSessions: new Map<string, string>(),
    authorizedArtifacts: new Map<string, string>(),
  } as ConnectedClient;

  return { ws, client, sent };
}

const SESSION_STATE: GatewayPushEvent = {
  type: 'session_state',
  workspaceId: 'workspace-a',
  sessionId: 'session-a',
  state: 'running',
  ts: 1,
};

describe('broadcastWorkspaceEvent', () => {
  it('sends to a client scoped to the event workspace', () => {
    const scoped = createClient(['workspace-a']);
    const clients = new Map([[scoped.ws, scoped.client]]);

    broadcastWorkspaceEvent(clients, 'workspace-a', SESSION_STATE);

    expect(scoped.sent).toEqual([JSON.stringify(SESSION_STATE)]);
  });

  it('never sends to a client scoped to another workspace', () => {
    const other = createClient(['workspace-b']);
    const clients = new Map([[other.ws, other.client]]);

    broadcastWorkspaceEvent(clients, 'workspace-a', SESSION_STATE);

    expect(other.sent).toEqual([]);
  });

  it('sends to the owner token, which has no workspace restriction', () => {
    const owner = createClient(null);
    const clients = new Map([[owner.ws, owner.client]]);

    broadcastWorkspaceEvent(clients, 'workspace-a', SESSION_STATE);

    expect(owner.sent).toHaveLength(1);
  });

  it('never sends to an unauthenticated client', () => {
    const pending = createClient(null, { authenticated: false });
    const clients = new Map([[pending.ws, pending.client]]);

    broadcastWorkspaceEvent(clients, 'workspace-a', SESSION_STATE);

    expect(pending.sent).toEqual([]);
  });

  it('reaches a session the client has never listed', () => {
    // hasSessionAccess would refuse this client: authorizedSessions is
    // empty. Workspace access is the point of this helper.
    const scoped = createClient(['workspace-a']);
    expect(scoped.client.authorizedSessions.size).toBe(0);
    const clients = new Map([[scoped.ws, scoped.client]]);

    broadcastWorkspaceEvent(clients, 'workspace-a', SESSION_STATE);

    expect(scoped.sent).toHaveLength(1);
  });
});
