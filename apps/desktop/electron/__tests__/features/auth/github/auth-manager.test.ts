import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

interface SafeStorageOptions {
  available: boolean;
}

function createSafeStorageMock(options: SafeStorageOptions) {
  return {
    isEncryptionAvailable: vi.fn(() => options.available),
    encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`)),
    decryptString: vi.fn((value: Buffer) => {
      const decoded = value.toString();
      if (!decoded.startsWith('enc:')) {
        throw new Error('Corrupt encrypted payload');
      }
      return decoded.slice(4);
    }),
  };
}

describe('GitHubAuthManager', () => {
  let tmpDir: string | null = null;

  async function importManager(options: SafeStorageOptions) {
    if (!tmpDir) {
      throw new Error('tmpDir not initialized');
    }

    vi.resetModules();

    const safeStorage = createSafeStorageMock(options);
    const shell = { openExternal: vi.fn() };
    const agentDir = path.join(tmpDir, 'agent');

    vi.doMock('electron', () => ({ safeStorage, shell }));
    vi.doMock('@electron/platform/env', () => ({
      SERO_HOME: tmpDir,
      SERO_AGENT_DIR: agentDir,
    }));

    const mod = await import('@electron/features/auth/github/auth-manager');
    return {
      GitHubAuthManager: mod.GitHubAuthManager,
      safeStorage,
      shell,
      tokenFile: path.join(agentDir, 'github-auth.json'),
      legacyTokenFile: path.join(tmpDir, 'github-auth.json'),
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock('electron');
    vi.unmock('@electron/platform/env');

    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('does not load cached tokens when secure storage is unavailable at startup', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-auth-'));

    const encrypted = Buffer.from('enc:token-123').toString('base64');
    const agentDir = path.join(tmpDir, 'agent');
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, 'github-auth.json'),
      JSON.stringify({ encrypted, username: 'octocat', scopes: 'repo', createdAt: '2026-01-01T00:00:00.000Z' }),
      'utf8',
    );

    const { GitHubAuthManager, tokenFile } = await importManager({ available: false });
    const manager = new GitHubAuthManager();

    expect(manager.getToken()).toBeNull();
    expect(manager.getStatus()).toEqual({ authenticated: false });
    expect(existsSync(tokenFile)).toBe(true);
  });

  it('clears a corrupt cached token file on startup', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-auth-corrupt-'));

    const agentDir = path.join(tmpDir, 'agent');
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(path.join(agentDir, 'github-auth.json'), '{not-valid-json', 'utf8');

    const { GitHubAuthManager, tokenFile } = await importManager({ available: true });
    const manager = new GitHubAuthManager();

    expect(manager.getToken()).toBeNull();
    expect(manager.getStatus()).toEqual({ authenticated: false });
    expect(existsSync(tokenFile)).toBe(false);
  });

  it('fails login clearly when secure storage cannot persist the token', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-auth-login-'));

    const { GitHubAuthManager } = await importManager({ available: false });
    const manager = new GitHubAuthManager() as unknown as {
      login: (onProgress: (event: unknown) => void) => Promise<void>;
      getToken: () => string | null;
      getStatus: () => { authenticated: boolean; username?: string };
      requestDeviceCode: () => Promise<{ user_code: string; verification_uri: string; expires_in: number; interval: number; device_code: string }>;
      pollForToken: () => Promise<string>;
      fetchUser: () => Promise<{ login: string }>;
    };

    manager.requestDeviceCode = vi.fn().mockResolvedValue({
      device_code: 'device-code',
      user_code: 'CODE-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    });
    manager.pollForToken = vi.fn().mockResolvedValue('gho_test_token');
    manager.fetchUser = vi.fn().mockResolvedValue({ login: 'octocat' });

    await expect(manager.login(vi.fn())).rejects.toThrow(
      'Secure storage is unavailable, so GitHub auth cannot persist your token safely.',
    );
    expect(manager.getToken()).toBeNull();
    expect(manager.getStatus()).toEqual({ authenticated: false });
  });

  it('removes both current and legacy token files on logout', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-auth-logout-'));

    const { GitHubAuthManager, tokenFile, legacyTokenFile } = await importManager({ available: true });
    await fs.mkdir(path.dirname(tokenFile), { recursive: true });

    const stored = JSON.stringify({
      encrypted: Buffer.from('enc:token-123').toString('base64'),
      username: 'octocat',
      scopes: 'repo',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await fs.writeFile(tokenFile, stored, 'utf8');
    await fs.writeFile(legacyTokenFile, stored, 'utf8');

    const manager = new GitHubAuthManager();
    expect(manager.getStatus()).toEqual({ authenticated: true, username: 'octocat' });

    manager.logout();

    expect(existsSync(tokenFile)).toBe(false);
    expect(existsSync(legacyTokenFile)).toBe(false);
    expect(manager.getStatus()).toEqual({ authenticated: false });
  });
});
