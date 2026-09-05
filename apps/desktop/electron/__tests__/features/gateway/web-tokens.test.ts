import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { WebTokenManager } from '@electron/features/gateway/bridge/web-tokens';

describe('WebTokenManager', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('creates unrestricted owner tokens with null workspace scope', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'web-token-test-'));

    const manager = new WebTokenManager(tmpDir);
    const token = manager.create(null, 'Owner device', 7);

    expect(token.workspaceIds).toBeNull();
    expect(manager.validate(token.token)?.workspaceIds).toBeNull();
    expect(manager.list()).toEqual([
      expect.objectContaining({
        label: 'Owner device',
        workspaceIds: null,
      }),
    ]);

    const stored = JSON.parse(await readFile(path.join(tmpDir, 'gateway-web-tokens.json'), 'utf8')) as unknown[];
    expect(stored).toEqual([
      expect.objectContaining({
        label: 'Owner device',
        workspaceIds: null,
      }),
    ]);
  });

  it('loads both legacy unrestricted tokens and scoped tokens from disk', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'web-token-test-'));

    await writeFile(
      path.join(tmpDir, 'gateway-web-tokens.json'),
      JSON.stringify([
        {
          token: 'a'.repeat(64),
          createdAt: '2026-04-17T00:00:00.000Z',
          expiresAt: '2099-04-17T00:00:00.000Z',
          label: 'Legacy owner token',
        },
        {
          token: 'b'.repeat(64),
          createdAt: '2026-04-17T00:00:00.000Z',
          expiresAt: '2099-04-17T00:00:00.000Z',
          label: 'Scoped token',
          workspaceIds: ['workspace-a'],
        },
      ], null, 2),
      'utf8',
    );

    const manager = new WebTokenManager(tmpDir);

    expect(manager.validate('a'.repeat(64))?.workspaceIds).toBeNull();
    expect(manager.validate('b'.repeat(64))?.workspaceIds).toEqual(['workspace-a']);
    expect(manager.list()).toEqual([
      expect.objectContaining({
        label: 'Legacy owner token',
        workspaceIds: null,
      }),
      expect.objectContaining({
        label: 'Scoped token',
        workspaceIds: ['workspace-a'],
      }),
    ]);
  });

  it('refuses to pair past the limit instead of unpairing the oldest device', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'web-token-test-'));
    const manager = new WebTokenManager(tmpDir);

    const first = manager.create(null, 'Phone', 7);
    for (let i = 1; i < 10; i += 1) manager.create(null, `Device ${i}`, 7);

    expect(() => manager.create(null, 'One too many', 7)).toThrow(
      'Already paired with 10 devices. Revoke one before pairing another.',
    );

    // The device paired first must still work. Dropping it silently is
    // what used to unpair a phone with nothing said to anyone.
    expect(manager.validate(first.token)).not.toBeNull();
    expect(manager.list()).toHaveLength(10);
  });

  it('pairs again once a device is unpaired', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'web-token-test-'));
    const manager = new WebTokenManager(tmpDir);

    const first = manager.create(null, 'Phone', 7);
    for (let i = 1; i < 10; i += 1) manager.create(null, `Device ${i}`, 7);

    manager.revoke(first.token.slice(0, 8));

    expect(() => manager.create(null, 'New phone', 7)).not.toThrow();
    expect(manager.list()).toHaveLength(10);
    expect(manager.validate(first.token)).toBeNull();
  });

  it('never returns the raw token from the listing', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'web-token-test-'));
    const manager = new WebTokenManager(tmpDir);

    const created = manager.create(null, 'Phone', 7);
    const [listed] = manager.list();

    // A QR can be shown once because of this. The renderer is never
    // handed a credential it could pair a second device with.
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(listed.tokenId).toBe(created.token.slice(0, 8));
  });
});
