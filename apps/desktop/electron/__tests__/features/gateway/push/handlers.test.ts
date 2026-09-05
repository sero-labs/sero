import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { routePushRequest } from '@electron/features/gateway/push/handlers';
import type { PushService } from '@electron/features/gateway/push/service';
import type { ConnectedClient } from '@electron/features/gateway';
import type { GatewayRequest } from '@electron/features/gateway/server/protocol';

interface SentResponse {
  type: string;
  requestType?: string;
  data?: unknown;
  message?: string;
}

function fakeSocket(): { ws: WebSocket; sent: SentResponse[] } {
  const sent: SentResponse[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as SentResponse),
  } as unknown as WebSocket;
  return { ws, sent };
}

function client(tokenId: string, workspaceIds: string[] | null): ConnectedClient {
  return {
    tokenId,
    authorizedWorkspaceIds: workspaceIds === null ? null : new Set(workspaceIds),
  } as unknown as ConnectedClient;
}

function fakePush(enabled = true) {
  const subscribe = vi.fn(
    (_tokenId: string, _workspaceIds: string[] | null, _input: unknown) => {},
  );
  const unsubscribe = vi.fn((_endpoint: string) => true);
  return {
    subscribe,
    unsubscribe,
    service: {
      enabled,
      publicKey: enabled ? 'public-key' : null,
      subscribe,
      unsubscribe,
    } as unknown as PushService,
  };
}

const subscribeRequest = {
  type: 'push_subscribe',
  endpoint: 'https://push.example/a',
  p256dh: 'key',
  auth: 'secret',
} as GatewayRequest;

describe('push_status', () => {
  it('hands back the key when push works here', () => {
    const { ws, sent } = fakeSocket();

    routePushRequest(ws, client('t1', null), { type: 'push_status' } as GatewayRequest, fakePush().service);

    expect(sent[0].data).toEqual({ enabled: true, publicKey: 'public-key' });
  });

  it('says push is off when no key could be made', () => {
    const { ws, sent } = fakeSocket();

    routePushRequest(ws, client('t1', null), { type: 'push_status' } as GatewayRequest, fakePush(false).service);

    expect(sent[0].data).toEqual({ enabled: false, publicKey: null });
  });
});

describe('push_subscribe', () => {
  it('files the subscription under the token and its scope', () => {
    const { ws, sent } = fakeSocket();
    const push = fakePush();

    routePushRequest(ws, client('token-a', ['ws-1']), subscribeRequest, push.service);

    expect(push.subscribe).toHaveBeenCalledWith('token-a', ['ws-1'], {
      endpoint: 'https://push.example/a',
      p256dh: 'key',
      auth: 'secret',
    });
    expect(sent[0]).toMatchObject({ type: 'ok' });
  });

  it('files an owner token with no workspace limit', () => {
    const { ws } = fakeSocket();
    const push = fakePush();

    routePushRequest(ws, client('master', null), subscribeRequest, push.service);

    expect(push.subscribe).toHaveBeenCalledWith('master', null, expect.anything());
  });

  it('refuses when push is off on this machine', () => {
    const { ws, sent } = fakeSocket();
    const push = fakePush(false);

    routePushRequest(ws, client('token-a', null), subscribeRequest, push.service);

    expect(sent[0]).toMatchObject({ type: 'error' });
    expect(push.subscribe).not.toHaveBeenCalled();
  });
});

describe('push_unsubscribe', () => {
  it('forgets the endpoint', () => {
    const { ws, sent } = fakeSocket();
    const push = fakePush();

    routePushRequest(
      ws,
      client('token-a', null),
      { type: 'push_unsubscribe', endpoint: 'https://push.example/a' } as GatewayRequest,
      push.service,
    );

    expect(push.unsubscribe).toHaveBeenCalledWith('https://push.example/a');
    expect(sent[0].data).toEqual({ removed: true });
  });
});

describe('other requests', () => {
  it('are left to the rest of the chain', () => {
    const { ws, sent } = fakeSocket();

    const handled = routePushRequest(
      ws,
      client('token-a', null),
      { type: 'list_workspaces' } as GatewayRequest,
      fakePush().service,
    );

    expect(handled).toBe(false);
    expect(sent).toEqual([]);
  });
});
