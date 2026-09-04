import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PushSubscriptionStore,
  subscriptionReaches,
  type PushSubscriptionRecord,
} from '@electron/features/gateway/push/subscriptions';

let configDir: string;

function record(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    tokenId: 'abcd1234',
    endpoint: 'https://push.example/one',
    p256dh: 'key',
    auth: 'secret',
    workspaceIds: ['ws-1'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-push-'));
});

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe('the subscription store', () => {
  it('keeps one record per endpoint, so a re-subscribe does not double the push', () => {
    const store = new PushSubscriptionStore(configDir);

    store.add(record({ p256dh: 'old' }));
    store.add(record({ p256dh: 'new' }));

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].p256dh).toBe('new');
  });

  it('survives a restart', () => {
    new PushSubscriptionStore(configDir).add(record());

    expect(new PushSubscriptionStore(configDir).list()).toHaveLength(1);
  });

  it('writes the file so only its owner can read it', () => {
    new PushSubscriptionStore(configDir).add(record());

    const mode = fs.statSync(path.join(configDir, 'gateway-push-subscriptions.json')).mode;
    expect(mode & 0o077).toBe(0);
  });

  it('forgets every subscription a revoked token made', () => {
    const store = new PushSubscriptionStore(configDir);
    store.add(record({ endpoint: 'https://push.example/a', tokenId: 'gone' }));
    store.add(record({ endpoint: 'https://push.example/b', tokenId: 'gone' }));
    store.add(record({ endpoint: 'https://push.example/c', tokenId: 'stays' }));

    expect(store.removeForToken('gone')).toBe(2);
    expect(store.list().map((s) => s.tokenId)).toEqual(['stays']);
  });

  it('drops subscriptions whose token is gone, but keeps the master token', () => {
    const store = new PushSubscriptionStore(configDir);
    store.add(record({ endpoint: 'https://push.example/a', tokenId: 'master' }));
    store.add(record({ endpoint: 'https://push.example/b', tokenId: 'alive' }));
    store.add(record({ endpoint: 'https://push.example/c', tokenId: 'expired' }));

    store.pruneToTokens(new Set(['alive']));

    expect(store.list().map((s) => s.tokenId).sort()).toEqual(['alive', 'master']);
  });

  it('ignores a malformed record on disk rather than failing to start', () => {
    fs.writeFileSync(
      path.join(configDir, 'gateway-push-subscriptions.json'),
      JSON.stringify([{ tokenId: 'x' }, record()]),
    );

    expect(new PushSubscriptionStore(configDir).list()).toHaveLength(1);
  });
});

describe('subscriptionReaches', () => {
  it('lets a scoped token see its own workspace', () => {
    expect(subscriptionReaches(record({ workspaceIds: ['ws-1'] }), 'ws-1')).toBe(true);
  });

  it('keeps a scoped token out of another workspace', () => {
    expect(subscriptionReaches(record({ workspaceIds: ['ws-1'] }), 'ws-2')).toBe(false);
  });

  it('lets an owner token see any workspace', () => {
    expect(subscriptionReaches(record({ workspaceIds: null }), 'ws-9')).toBe(true);
  });

  it('gives an entry with no workspace to owner tokens only', () => {
    expect(subscriptionReaches(record({ workspaceIds: null }), undefined)).toBe(true);
    expect(subscriptionReaches(record({ workspaceIds: ['ws-1'] }), undefined)).toBe(false);
  });
});
