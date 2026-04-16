import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readRegistrySync: vi.fn(),
  findTokenCandidateEmails: vi.fn(),
  exportTokenForClient: vi.fn(),
  parseEmailFromTokenData: vi.fn(),
  gogExecWithPassword: vi.fn(),
  deriveProfileScopedKeyringPassword: vi.fn(),
  argsWithClient: vi.fn((clientName: string, args: string[]) => ['--client', clientName, ...args]),
  pipeToGog: vi.fn(),
}));

vi.mock('@electron/features/profile/manager', () => ({
  readRegistrySync: mocks.readRegistrySync,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/profiles/current/agent',
}));

vi.mock('@electron/features/auth/google/gog-keyring', () => ({
  GOG_DEFAULT_CLIENT: 'default',
  argsWithClient: mocks.argsWithClient,
  deriveProfileScopedKeyringPassword: mocks.deriveProfileScopedKeyringPassword,
  exportTokenForClient: mocks.exportTokenForClient,
  findTokenCandidateEmails: mocks.findTokenCandidateEmails,
  gogExecWithPassword: mocks.gogExecWithPassword,
  parseEmailFromTokenData: mocks.parseEmailFromTokenData,
  pipeToGog: mocks.pipeToGog,
}));

import {
  findAccessibleEmail,
  migrateFromBuggyKeyring,
} from '@electron/features/auth/google/status';

describe('google auth status helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTokenCandidateEmails.mockReturnValue([]);
    mocks.parseEmailFromTokenData.mockImplementation(() => null);
    mocks.gogExecWithPassword.mockResolvedValue(null);
    mocks.readRegistrySync.mockReturnValue({ profiles: [] });
    mocks.pipeToGog.mockResolvedValue({ ok: true, out: '' });
    mocks.deriveProfileScopedKeyringPassword.mockImplementation((profileDir: string) => `pw:${profileDir}`);
  });

  it('resolves accessible email from exported token payloads first', async () => {
    mocks.findTokenCandidateEmails.mockReturnValue(['user@example.com']);
    mocks.exportTokenForClient.mockResolvedValue('{"email":"token@example.com"}');
    mocks.parseEmailFromTokenData.mockReturnValue('token@example.com');

    const email = await findAccessibleEmail('stable-password', 'profile-alpha');

    expect(email).toBe('token@example.com');
    expect(mocks.gogExecWithPassword).not.toHaveBeenCalled();
  });

  it('falls back to legacy profile passwords during migration when one token exists', async () => {
    mocks.findTokenCandidateEmails.mockReturnValue(['user@example.com']);
    mocks.readRegistrySync.mockReturnValue({
      profiles: [
        { path: '/profiles/current' },
        { path: '/profiles/other' },
      ],
    });
    mocks.deriveProfileScopedKeyringPassword.mockImplementation((profileDir: string) => {
      if (profileDir === '/profiles/current/agent') return 'pw-current';
      if (profileDir === '/profiles/other/agent') return 'pw-other';
      return 'pw-unknown';
    });
    mocks.exportTokenForClient
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('{"email":"user@example.com","refresh_token":"rt"}');
    mocks.parseEmailFromTokenData.mockReturnValue('user@example.com');

    const ensureCredentials = vi.fn().mockResolvedValue(undefined);
    const migratedEmail = await migrateFromBuggyKeyring('profile-alpha', ensureCredentials);

    expect(migratedEmail).toBe('user@example.com');
    expect(ensureCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.pipeToGog).toHaveBeenCalledWith(
      ['--client', 'profile-alpha', 'auth', 'tokens', 'import', '-'],
      '{"email":"user@example.com","refresh_token":"rt"}',
    );
  });
});
