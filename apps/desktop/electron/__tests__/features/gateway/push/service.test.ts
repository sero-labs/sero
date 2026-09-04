import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'pub-key', privateKey: 'priv-key' }),
    setVapidDetails: () => {},
    sendNotification: async () => ({}),
  },
}));

import {
  getPushService,
  PushService,
  resetPushService,
} from '@electron/features/gateway/push/service';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-push-service-'));
  resetPushService();
});

afterEach(() => {
  resetPushService();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the push service', () => {
  it('makes a key pair on first use and keeps it', () => {
    const first = new PushService(root).publicKey;

    expect(first).toBe('pub-key');
    expect(fs.existsSync(path.join(root, 'gateway-push-vapid.json'))).toBe(true);
    expect(new PushService(root).publicKey).toBe(first);
  });

  it('writes the key pair so only its owner can read it', () => {
    new PushService(root);

    const mode = fs.statSync(path.join(root, 'gateway-push-vapid.json')).mode;
    expect(mode & 0o077).toBe(0);
  });

  it('is reused for one profile', () => {
    expect(getPushService(root)).toBe(getPushService(root));
  });

  it('is rebuilt for another profile, so phones do not cross over', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-push-other-'));
    try {
      expect(getPushService(root)).not.toBe(getPushService(other));
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('sends nothing when push is off', async () => {
    const service = new PushService(root);
    Reflect.set(service, 'publicKey', null);

    const sent = await service.push(
      { title: 'x', kind: 'notification', path: '/' },
      new Set(),
    );

    expect(sent).toBe(0);
  });
});
