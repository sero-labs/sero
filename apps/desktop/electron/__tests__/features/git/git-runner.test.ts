import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import { GitRunner, resetGitRunnerSshAvailabilityCacheForTests } from '@electron/features/git/core/git-runner';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { RuntimeBackend, RuntimeExecFileInput, RuntimeExecResult } from '@electron/features/workspace/runtime/types';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
  execFileSync: vi.fn(),
  spawn: vi.fn(),
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

function createWorkspaceManager(workspacePath = '/tmp/ws-1'): WorkspaceManager {
  return { getPath: vi.fn(() => workspacePath) } as unknown as WorkspaceManager;
}

function createGithubAuth(): GitHubAuthManager {
  return { getAuthEnvVars: vi.fn(() => AUTH_VARS) } as unknown as GitHubAuthManager;
}

function createRuntime(options: {
  sshAvailable: boolean;
  execFile?: (input: RuntimeExecFileInput) => Promise<RuntimeExecResult>;
}): RuntimeBackend {
  return {
    backend: 'host',
    workspaceId: 'ws-1',
    hostWorkspacePath: '/tmp/ws-1',
    runtimeWorkspacePath: '/workspace',
    workspaceAccess: 'host',
    capabilities: {} as RuntimeBackend['capabilities'],
    health: vi.fn(),
    ensure: vi.fn(),
    destroy: vi.fn(),
    exec: vi.fn(),
    execFile: vi.fn(options.execFile ?? (async () => ({ exitCode: 0, stdout: '', stderr: '' }))),
    isSshAvailable: vi.fn(async () => options.sshAvailable),
    spawn: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listFiles: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    watchFiles: vi.fn(),
    createTerminal: vi.fn(),
    startDevServer: vi.fn(),
    stopDevServer: vi.fn(),
    restartDevServer: vi.fn(),
    getDevServerStatus: vi.fn(),
    forwardPort: vi.fn(),
    stopForward: vi.fn(),
    resolvePreviewUrl: vi.fn(),
  } as unknown as RuntimeBackend;
}

function createRunner(runtime: RuntimeBackend, workspacePath?: string): GitRunner {
  const runtimeManager = {
    getRuntime: vi.fn(async () => runtime),
  } as unknown as RuntimeManager;
  return new GitRunner(createWorkspaceManager(workspacePath), runtimeManager, createGithubAuth());
}

describe('GitRunner runtime execFile path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T12:00:00.000Z'));
    resetGitRunnerSshAvailabilityCacheForTests();
    mocks.execFileMock.mockReset();
  });

  it('passes auth and extra vars in execFile.env instead of shell-concatenating them', async () => {
    const runtime = createRuntime({ sshAvailable: false });
    const runner = createRunner(runtime);

    await runner.runWithEnv('ws-1', ['status'], { CUSTOM_FLAG: '1' });

    expect(runtime.exec).not.toHaveBeenCalled();
    expect(runtime.execFile).toHaveBeenCalledWith(expect.objectContaining({
      program: 'git',
      args: ['status'],
      env: expect.objectContaining({
        GH_TOKEN: 'gh-token',
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '3',
        CUSTOM_FLAG: '1',
      }),
    }));
  });

  it('keeps token and HTTPS extraheader but omits SSH-to-HTTPS rewrites when SSH is available', async () => {
    const runtime = createRuntime({ sshAvailable: true });
    const runner = createRunner(runtime);

    await runner.run('ws-1', ['status']);

    const execInput = vi.mocked(runtime.execFile).mock.calls[0]?.[0];
    expect(execInput?.env).toEqual(expect.objectContaining({
      GH_TOKEN: 'gh-token',
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: 'AUTH HEADER',
    }));
    expect(execInput?.env?.GIT_CONFIG_VALUE_1).toBeUndefined();
  });

  it('passes all GitHub auth vars when SSH is unavailable', async () => {
    const runtime = createRuntime({ sshAvailable: false });
    const runner = createRunner(runtime);

    await runner.run('ws-1', ['status']);

    expect(vi.mocked(runtime.execFile).mock.calls[0]?.[0].env).toEqual(expect.objectContaining(AUTH_VARS));
  });

  it('caches SSH availability for the TTL', async () => {
    const runtime = createRuntime({ sshAvailable: true });
    const runner = createRunner(runtime);

    await runner.run('ws-1', ['status']);
    vi.advanceTimersByTime(30_000);
    await runner.run('ws-1', ['status']);
    vi.advanceTimersByTime(31_000);
    await runner.run('ws-1', ['status']);

    expect(runtime.isSshAvailable).toHaveBeenCalledTimes(2);
  });
});
