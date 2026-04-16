import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGoogleCredentials: vi.fn(),
  pipeToGog: vi.fn(),
  gogExecWithPassword: vi.fn(),
  argsWithClient: vi.fn((clientName: string, args: string[]) => ['--client', clientName, ...args]),
  deriveKeyringPassword: vi.fn(() => 'stable-password'),
}));

vi.mock('@electron/features/auth/google/config', () => ({
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  getGoogleCredentials: mocks.getGoogleCredentials,
}));

vi.mock('@electron/features/auth/google/gog-keyring', () => ({
  argsWithClient: mocks.argsWithClient,
  deriveKeyringPassword: mocks.deriveKeyringPassword,
  gogExecWithPassword: mocks.gogExecWithPassword,
  pipeToGog: mocks.pipeToGog,
}));

import { GoogleCredentialManager } from '@electron/features/auth/google/credentials';

describe('GoogleCredentialManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCredentials.mockReturnValue({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    mocks.pipeToGog.mockResolvedValue({ ok: true, out: '' });
  });

  it('skips credential import when the gog client already has credentials', async () => {
    mocks.gogExecWithPassword.mockResolvedValueOnce(
      JSON.stringify({ account: { credentials_exists: true } }),
    );

    const manager = new GoogleCredentialManager();
    await manager.ensureCredentials('profile-alpha');

    expect(mocks.gogExecWithPassword).toHaveBeenCalledTimes(1);
    expect(mocks.pipeToGog).not.toHaveBeenCalled();
  });

  it('imports credentials once and memoizes the client check', async () => {
    mocks.gogExecWithPassword.mockResolvedValueOnce(
      JSON.stringify({ account: { credentials_exists: false } }),
    );

    const manager = new GoogleCredentialManager();
    await manager.ensureCredentials('profile-alpha');
    await manager.ensureCredentials('profile-alpha');

    expect(mocks.gogExecWithPassword).toHaveBeenCalledTimes(1);
    expect(mocks.pipeToGog).toHaveBeenCalledTimes(1);
    expect(mocks.pipeToGog).toHaveBeenCalledWith(
      ['--client', 'profile-alpha', 'auth', 'credentials', 'set', '-'],
      expect.stringContaining('google-client-id'),
    );
  });

  it('imports refresh tokens through the profile client bucket', async () => {
    mocks.gogExecWithPassword.mockResolvedValueOnce(
      JSON.stringify({ account: { credentials_exists: false } }),
    );

    const manager = new GoogleCredentialManager();
    await manager.importRefreshToken('profile-alpha', 'user@example.com', 'refresh-token');

    expect(mocks.pipeToGog).toHaveBeenNthCalledWith(
      1,
      ['--client', 'profile-alpha', 'auth', 'credentials', 'set', '-'],
      expect.any(String),
    );
    expect(mocks.pipeToGog).toHaveBeenNthCalledWith(
      2,
      ['--client', 'profile-alpha', 'auth', 'tokens', 'import', '-'],
      JSON.stringify({ email: 'user@example.com', refresh_token: 'refresh-token' }),
    );
  });
});
