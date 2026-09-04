import { describe, expect, it, beforeEach, vi } from 'vitest';

/** The push library is replaced: no test may reach a push service. */
const sendNotification = vi.fn(async (_sub: unknown, _body: unknown, _opts: unknown) => ({}));
vi.mock('web-push', () => ({
  default: {
    sendNotification: (sub: unknown, body: unknown, opts: unknown) =>
      sendNotification(sub, body, opts),
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    setVapidDetails: () => {},
  },
}));

import { sendPush, type PushPayload } from '@electron/features/gateway/push/sender';
import type {
  PushSubscriptionRecord,
  PushSubscriptionStore,
} from '@electron/features/gateway/push/subscriptions';

function record(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    tokenId: 'token-a',
    endpoint: 'https://push.example/a',
    p256dh: 'key',
    auth: 'secret',
    workspaceIds: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A store standing in for the file-backed one. */
function fakeStore(records: PushSubscriptionRecord[]) {
  const removed: string[] = [];
  return {
    removed,
    store: {
      list: () => records,
      remove: (endpoint: string) => {
        removed.push(endpoint);
        return true;
      },
    } as unknown as PushSubscriptionStore,
  };
}

const payload: PushPayload = {
  title: 'Session has something for you',
  kind: 'notification',
  path: '/',
  workspaceId: 'ws-1',
};

beforeEach(() => {
  sendNotification.mockClear();
  sendNotification.mockResolvedValue({});
});

describe('sendPush', () => {
  it('sends to a phone whose token reaches the workspace', async () => {
    const { store } = fakeStore([record({ workspaceIds: ['ws-1'] })]);

    expect(await sendPush(store, payload, new Set())).toBe(1);
  });

  it('sends nothing to a token that cannot reach the workspace', async () => {
    const { store } = fakeStore([record({ workspaceIds: ['ws-2'] })]);

    expect(await sendPush(store, payload, new Set())).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skips a token that already has a client connected', async () => {
    const { store } = fakeStore([record({ tokenId: 'token-a' })]);

    expect(await sendPush(store, payload, new Set(['token-a']))).toBe(0);
  });

  it('carries no message text in the payload', async () => {
    const { store } = fakeStore([record()]);

    await sendPush(store, payload, new Set());

    const body = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(Object.keys(body).sort()).toEqual(['kind', 'path', 'title', 'workspaceId']);
  });

  it('forgets a subscription the browser threw away', async () => {
    const { store, removed } = fakeStore([record()]);
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });

    expect(await sendPush(store, payload, new Set())).toBe(0);
    expect(removed).toEqual(['https://push.example/a']);
  });

  it('keeps a subscription that failed for another reason', async () => {
    const { store, removed } = fakeStore([record()]);
    sendNotification.mockRejectedValueOnce({ statusCode: 500 });

    expect(await sendPush(store, payload, new Set())).toBe(0);
    expect(removed).toEqual([]);
  });

  it('sends to each phone, and one failure does not stop the rest', async () => {
    const { store } = fakeStore([
      record({ endpoint: 'https://push.example/a' }),
      record({ endpoint: 'https://push.example/b' }),
    ]);
    sendNotification.mockRejectedValueOnce({ statusCode: 500 });

    expect(await sendPush(store, payload, new Set())).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });
});
