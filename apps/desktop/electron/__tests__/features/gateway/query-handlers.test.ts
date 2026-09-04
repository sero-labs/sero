import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

// The feed writes to SERO_HOME and lives as a singleton. Give each test
// its own feed on a temporary path so nothing touches the real home.
let testFeed: NotificationFeed;
vi.mock('@electron/features/notifications/feed', async () => {
  const actual = await vi.importActual<typeof import('@electron/features/notifications/feed')>(
    '@electron/features/notifications/feed',
  );
  return { ...actual, getNotificationFeed: () => testFeed };
});

import { NotificationFeed } from '@electron/features/notifications/feed';
import { routeQueryRequest } from '@electron/features/gateway/server/query-handlers';
import { CostTracker } from '@electron/features/gateway/server/cost-tracker';
import type { GatewayAccessScope } from '@electron/features/gateway/server/access-control';
import type { GatewayAgentOps, GatewaySessionSearchResult } from '@electron/features/gateway/server/types';
import type { GatewayRequest } from '@electron/features/gateway/server/protocol';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

interface SentResponse {
  type: string;
  requestType?: string;
  data?: unknown;
  message?: string;
}

/** A socket that keeps what was sent to it. */
function fakeSocket(): { ws: WebSocket; sent: SentResponse[] } {
  const sent: SentResponse[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as SentResponse),
  } as unknown as WebSocket;
  return { ws, sent };
}

/** A scope reaching `workspaceIds`, or every workspace when null. */
function scope(workspaceIds: string[] | null): GatewayAccessScope {
  return {
    authorizedWorkspaceIds: workspaceIds === null ? null : new Set(workspaceIds),
    authorizedSessions: new Map(),
    authorizedArtifacts: new Map(),
  };
}

function result(sessionId: string, workspaceId: string): GatewaySessionSearchResult {
  return {
    sessionId,
    workspaceId,
    name: sessionId,
    snippet: 'match',
    matchCount: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeOps(overrides: Partial<GatewayAgentOps> = {}): {
  ops: GatewayAgentOps;
  searchSessions: ReturnType<typeof vi.fn>;
} {
  const searchSessions = vi.fn(
    async (_workspaceIds: string[], _query: string, _limit: number) =>
      [] as GatewaySessionSearchResult[],
  );
  const ops = {
    searchSessions,
    listWorkspaces: async () => [
      { id: 'ws-1', name: 'One', path: '/one' },
      { id: 'ws-2', name: 'Two', path: '/two' },
    ],
    ...overrides,
  } as unknown as GatewayAgentOps;
  return { ops, searchSessions };
}

function tracker(): CostTracker {
  return new CostTracker(mkdtempSync(path.join(tmpdir(), 'sero-query-handlers-')));
}

describe('search_sessions handler', () => {
  it('searches only the workspaces a scoped token reaches', async () => {
    const { ws, sent } = fakeSocket();
    const { ops, searchSessions } = makeOps();

    await routeQueryRequest(
      ws,
      ops,
      { type: 'search_sessions', query: 'match' } as GatewayRequest,
      scope(['ws-1']),
      tracker(),
    );

    expect(searchSessions).toHaveBeenCalledWith(['ws-1'], 'match', 20);
    expect(sent[0]?.type).toBe('ok');
  });

  it('searches every workspace for an owner token', async () => {
    const { ws } = fakeSocket();
    const { ops, searchSessions } = makeOps();

    await routeQueryRequest(
      ws,
      ops,
      { type: 'search_sessions', query: 'match' } as GatewayRequest,
      scope(null),
      tracker(),
    );

    expect(searchSessions).toHaveBeenCalledWith(['ws-1', 'ws-2'], 'match', 20);
  });

  it('caps the limit the client asks for', async () => {
    const { ws } = fakeSocket();
    const { ops, searchSessions } = makeOps();

    await routeQueryRequest(
      ws,
      ops,
      { type: 'search_sessions', query: 'match', limit: 500 } as GatewayRequest,
      scope(null),
      tracker(),
    );

    expect(searchSessions).toHaveBeenCalledWith(['ws-1', 'ws-2'], 'match', 20);
  });

  it('authorizes each matched session so the client can open it', async () => {
    const { ws } = fakeSocket();
    const { ops } = makeOps({
      searchSessions: async () => [result('s1', 'ws-1'), result('s2', 'ws-1')],
    });
    const accessScope = scope(['ws-1']);

    await routeQueryRequest(
      ws,
      ops,
      { type: 'search_sessions', query: 'match' } as GatewayRequest,
      accessScope,
      tracker(),
    );

    expect([...accessScope.authorizedSessions.keys()]).toEqual(['s1', 's2']);
  });

  it('answers with an error when the search throws', async () => {
    const { ws, sent } = fakeSocket();
    const { ops } = makeOps({
      searchSessions: async () => {
        throw new Error('disk gone');
      },
    });

    await routeQueryRequest(
      ws,
      ops,
      { type: 'search_sessions', query: 'match' } as GatewayRequest,
      scope(null),
      tracker(),
    );

    expect(sent[0]?.type).toBe('error');
    expect(sent[0]?.message).toBe('disk gone');
  });
});

describe('get_usage handler', () => {
  it('reports only the sessions a scoped token has listed', async () => {
    const { ws, sent } = fakeSocket();
    const { ops } = makeOps();
    const costTracker = tracker();
    costTracker.recordUsage('mine', 'claude-opus-4', 1000, 100);
    costTracker.recordUsage('theirs', 'claude-opus-4', 9000, 900);

    const accessScope = scope(['ws-1']);
    accessScope.authorizedSessions.set('mine', 'ws-1');

    await routeQueryRequest(ws, ops, { type: 'get_usage' } as GatewayRequest, accessScope, costTracker);

    const data = sent[0]?.data as { sessions: Array<{ sessionId: string }> };
    expect(data.sessions.map((session) => session.sessionId)).toEqual(['mine']);
  });

  it('reports every tracked session for an owner token', async () => {
    const { ws, sent } = fakeSocket();
    const { ops } = makeOps();
    const costTracker = tracker();
    costTracker.recordUsage('a', 'claude-opus-4', 1000, 100);
    costTracker.recordUsage('b', 'claude-opus-4', 1000, 100);

    await routeQueryRequest(ws, ops, { type: 'get_usage' } as GatewayRequest, scope(null), costTracker);

    const data = sent[0]?.data as { sessions: Array<{ sessionId: string }> };
    expect(data.sessions.map((session) => session.sessionId).sort()).toEqual(['a', 'b']);
  });
});

describe('routeQueryRequest', () => {
  it('leaves other request types to the next handler', async () => {
    const { ws, sent } = fakeSocket();
    const { ops } = makeOps();

    const handled = await routeQueryRequest(
      ws,
      ops,
      { type: 'list_workspaces' } as GatewayRequest,
      scope(null),
      tracker(),
    );

    expect(handled).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe('notification handlers', () => {
  let feedDir: string;

  beforeEach(() => {
    feedDir = mkdtempSync(path.join(tmpdir(), 'sero-query-notifications-'));
    testFeed = new NotificationFeed(path.join(feedDir, 'notifications.jsonl'));
  });

  afterEach(() => {
    rmSync(feedDir, { recursive: true, force: true });
  });

  it('hides an out-of-scope notification from a scoped token', async () => {
    const feed = testFeed;
    feed.notify({ message: 'mine', workspaceId: 'ws-1', silentOnDesktop: true });
    feed.notify({ message: 'theirs', workspaceId: 'ws-2', silentOnDesktop: true });
    feed.notify({ message: 'global', silentOnDesktop: true });

    const { ws, sent } = fakeSocket();
    const { ops } = makeOps();

    await routeQueryRequest(
      ws,
      ops,
      { type: 'list_notifications' } as GatewayRequest,
      scope(['ws-1']),
      tracker(),
    );

    const data = sent[0]?.data as Array<{ message: string }>;
    expect(data.map((entry) => entry.message)).toEqual(['mine']);
  });

  it('shows every notification to an owner token', async () => {
    const feed = testFeed;
    feed.notify({ message: 'mine', workspaceId: 'ws-1', silentOnDesktop: true });
    feed.notify({ message: 'global', silentOnDesktop: true });

    const { ws, sent } = fakeSocket();
    const { ops } = makeOps();

    await routeQueryRequest(
      ws,
      ops,
      { type: 'list_notifications' } as GatewayRequest,
      scope(null),
      tracker(),
    );

    const data = sent[0]?.data as Array<{ message: string }>;
    expect(data.map((entry) => entry.message).sort()).toEqual(['global', 'mine']);
  });

  it('marks entries read and reports what changed', async () => {
    const feed = testFeed;
    const entry = feed.notify({ message: 'mine', workspaceId: 'ws-1', silentOnDesktop: true });

    const { ws, sent } = fakeSocket();
    const { ops } = makeOps();

    await routeQueryRequest(
      ws,
      ops,
      { type: 'mark_notifications_read', ids: [entry.id] } as GatewayRequest,
      scope(['ws-1']),
      tracker(),
    );

    expect(sent[0]?.data).toEqual({ ids: [entry.id] });
    expect(feed.unreadCount()).toBe(0);
  });
});
