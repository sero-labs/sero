import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('util', () => ({
  promisify: () => execFileMock,
}));

import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import {
  execWorktreeGit,
  execWorktreeGh,
  setWorktreeGitHubAuth,
  resetWorktreeExecForTests,
} from '@electron/features/vcs/worktree/exec';

const AUTH_VARS = {
  GH_TOKEN: 'test-token',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
  GIT_CONFIG_VALUE_0: 'git@github.com:',
  GIT_CONFIG_KEY_1: 'url.https://github.com/.insteadOf',
  GIT_CONFIG_VALUE_1: 'ssh://git@github.com/',
  GIT_CONFIG_KEY_2: 'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_2: 'Authorization: Basic abc',
};

function stubAuth(token: string | null): GitHubAuthManager {
  return {
    getToken: () => token,
    getAuthEnvVars: () => (token ? AUTH_VARS : {}),
  } as unknown as GitHubAuthManager;
}

function lastEnvFor(program: string): Record<string, string> {
  const calls = execFileMock.mock.calls.filter((c) => c[0] === program);
  expect(calls.length).toBeGreaterThan(0);
  const call = calls[calls.length - 1];
  return (call[2] as { env: Record<string, string> }).env;
}

describe('worktree exec auth env', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    resetWorktreeExecForTests();
  });

  it('runs with plain process env when no auth is configured', async () => {
    execFileMock.mockResolvedValue({ stdout: 'ok', stderr: '' });

    const result = await execWorktreeGit(['status'], { cwd: '/tmp/repo', timeout: 5_000 });

    expect(result.stdout).toBe('ok');
    // No SSH probe without a token
    expect(execFileMock.mock.calls.filter((c) => c[0] === 'ssh')).toHaveLength(0);
    const env = lastEnvFor('git');
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
  });

  it('keeps token + auth header but drops the SSH rewrite when SSH works', async () => {
    setWorktreeGitHubAuth(stubAuth('test-token'));
    execFileMock.mockImplementation((program: string) => {
      if (program === 'ssh') {
        return Promise.reject({ stderr: 'Hi user! You\'ve successfully authenticated' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await execWorktreeGit(['fetch', 'origin'], { cwd: '/tmp/repo' });

    const env = lastEnvFor('git');
    expect(env.GH_TOKEN).toBe('test-token');
    expect(env.GIT_CONFIG_COUNT).toBe('1');
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(Object.values(env)).not.toContain('git@github.com:');
  });

  it('applies the full SSH→HTTPS rewrite when SSH is unavailable', async () => {
    setWorktreeGitHubAuth(stubAuth('test-token'));
    execFileMock.mockImplementation((program: string) => {
      if (program === 'ssh') return Promise.reject({ stderr: 'Permission denied' });
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await execWorktreeGh(['pr', 'list'], { cwd: '/tmp/repo' });

    const env = lastEnvFor('gh');
    expect(env.GH_TOKEN).toBe('test-token');
    expect(env.GIT_CONFIG_COUNT).toBe('3');
    expect(env.GIT_CONFIG_VALUE_0).toBe('git@github.com:');
  });

  it('caches the SSH probe across invocations', async () => {
    setWorktreeGitHubAuth(stubAuth('test-token'));
    execFileMock.mockImplementation((program: string) => {
      if (program === 'ssh') return Promise.reject({ stderr: 'Permission denied' });
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await execWorktreeGit(['status'], { cwd: '/tmp/repo' });
    await execWorktreeGit(['log'], { cwd: '/tmp/repo' });

    expect(execFileMock.mock.calls.filter((c) => c[0] === 'ssh')).toHaveLength(1);
  });
});
