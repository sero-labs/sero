import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContainerManager } from '@electron/features/container';
import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  existsSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
}));

vi.mock('util', () => ({
  promisify: () => mocks.execFileMock,
}));

vi.mock('fs', () => ({
  existsSync: mocks.existsSyncMock,
  statSync: mocks.statSyncMock,
}));

const AUTH_VARS = {
  GH_TOKEN: 'gh-token',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
  GIT_CONFIG_VALUE_0: 'ssh://git@github.com/',
  GIT_CONFIG_KEY_1: 'url.https://github.com/.insteadOf',
  GIT_CONFIG_VALUE_1: 'git@github.com:',
  GIT_CONFIG_KEY_2: 'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_2: 'AUTH HEADER',
} as const;

function isKnownSshKeyPath(target: string): boolean {
  return target.endsWith('/.ssh/id_ed25519')
    || target.endsWith('/.ssh/id_rsa')
    || target.endsWith('/.ssh/id_ecdsa');
}

function getGitCommandEnvs(): NodeJS.ProcessEnv[] {
  return mocks.execFileMock.mock.calls
    .filter((call) => call[0] === 'git')
    .map((call) => {
      const options = call[2];
      if (typeof options !== 'object' || options === null || !('env' in options)) {
        return {};
      }
      const env = (options as { env?: NodeJS.ProcessEnv }).env;
      return env ?? {};
    });
}

async function createRunner() {
  vi.resetModules();
  const { GitRunner } = await import('@electron/features/vcs/core/git-runner');

  const workspaceManager = {
    getPath: vi.fn(() => '/tmp/ws-1'),
    isContainerEnabled: vi.fn(async () => false),
  } as unknown as WorkspaceManager;

  const containerManager = {
    ensure: vi.fn(async () => undefined),
    exec: vi.fn(),
  } as unknown as ContainerManager;

  const githubAuth = {
    getAuthEnvVars: vi.fn(() => AUTH_VARS),
  } as unknown as GitHubAuthManager;

  return new GitRunner(workspaceManager, containerManager, githubAuth);
}

describe('GitRunner host SSH transport probing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T12:00:00.000Z'));

    mocks.execFileMock.mockReset();
    mocks.existsSyncMock.mockReset();
    mocks.statSyncMock.mockReset();
    mocks.existsSyncMock.mockImplementation((target: string) => isKnownSshKeyPath(target));
    mocks.statSyncMock.mockImplementation(() => ({ size: 100, mtimeMs: 1_000 }));
  });

  it('re-probes SSH availability after cache TTL expires', async () => {
    let sshProbeCount = 0;
    mocks.execFileMock.mockImplementation(async (program: string, _args: string[]) => {
      if (program === 'ssh') {
        sshProbeCount += 1;
        if (sshProbeCount === 1) {
          return { stdout: '', stderr: 'You\'ve successfully authenticated, but GitHub does not provide shell access.' };
        }
        return { stdout: '', stderr: 'Permission denied (publickey).' };
      }

      return { stdout: '', stderr: '' };
    });

    const runner = await createRunner();

    await runner.run('ws-1', ['status']);
    vi.advanceTimersByTime(30_000);
    await runner.run('ws-1', ['status']);
    vi.advanceTimersByTime(31_000);
    await runner.run('ws-1', ['status']);

    expect(sshProbeCount).toBe(2);

    const gitEnvs = getGitCommandEnvs();
    expect(gitEnvs).toHaveLength(3);
    expect(gitEnvs[0]?.GIT_CONFIG_COUNT).toBe('1');
    expect(gitEnvs[1]?.GIT_CONFIG_COUNT).toBe('1');
    expect(gitEnvs[2]?.GIT_CONFIG_COUNT).toBe('3');
  });

  it('re-probes SSH availability when SSH key metadata changes before TTL expiry', async () => {
    let currentMtimeMs = 1_000;
    mocks.statSyncMock.mockImplementation(() => ({ size: 100, mtimeMs: currentMtimeMs }));

    let sshProbeCount = 0;
    mocks.execFileMock.mockImplementation(async (program: string, _args: string[]) => {
      if (program === 'ssh') {
        sshProbeCount += 1;
        if (sshProbeCount === 1) {
          return { stdout: '', stderr: 'You\'ve successfully authenticated, but GitHub does not provide shell access.' };
        }
        return { stdout: '', stderr: 'Permission denied (publickey).' };
      }

      return { stdout: '', stderr: '' };
    });

    const runner = await createRunner();

    await runner.run('ws-1', ['status']);
    currentMtimeMs = 2_000;
    vi.advanceTimersByTime(10_000);
    await runner.run('ws-1', ['status']);

    expect(sshProbeCount).toBe(2);

    const gitEnvs = getGitCommandEnvs();
    expect(gitEnvs).toHaveLength(2);
    expect(gitEnvs[0]?.GIT_CONFIG_COUNT).toBe('1');
    expect(gitEnvs[1]?.GIT_CONFIG_COUNT).toBe('3');
  });
});
