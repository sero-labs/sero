import { describe, expect, it, vi } from 'vitest';
import type { ContainerManager } from '@electron/features/container';
import { AppleContainerBackend } from '@electron/features/workspace/runtime/backends/apple-container-backend';
import { DockerBackend } from '@electron/features/workspace/runtime/backends/docker/docker-backend';
import type { DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

const workspaceManager = {
  getRuntimeConfig: vi.fn().mockResolvedValue({ previewPortPoolSize: 1 }),
  getRoots: vi.fn().mockResolvedValue([]),
  getMounts: vi.fn().mockResolvedValue([]),
} as unknown as WorkspaceManager;

describe('RuntimeBackend execFile', () => {
  it('executes Docker argv without shell-joining args', async () => {
    const runMock = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const backend = new DockerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/host/workspace',
      workspaceManager,
      run: runMock as DockerRunner,
    });
    vi.spyOn(backend, 'ensure').mockResolvedValue({
      backend: 'docker',
      workspaceId: 'ws-1',
      hostWorkspacePath: '/host/workspace',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
    });

    await backend.execFile({ program: 'git', args: ['status', '--porcelain=v1', "quote'arg"], cwd: '/workspace/sub' });

    const [args, options] = runMock.mock.calls[0];
    expect(args.slice(0, 3)).toEqual(['exec', '-w', '/workspace/sub']);
    expect(args.slice(-5)).toEqual(['sero-ws-1', 'git', 'status', '--porcelain=v1', "quote'arg"]);
    expect(options).toEqual({ timeoutMs: 120_000 });
  });

  it('honors Docker execFile isolation requests', async () => {
    const runMock = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const backend = new DockerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/host/workspace',
      workspaceManager,
      run: runMock as DockerRunner,
    });
    const ensureWithOptions = vi.spyOn(backend as unknown as {
      ensureWithOptions(input?: { isolated?: boolean }): Promise<unknown>;
    }, 'ensureWithOptions').mockResolvedValue({
      backend: 'docker',
      workspaceId: 'ws-1',
      hostWorkspacePath: '/host/workspace',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
    });

    await backend.execFile({ program: 'node', args: ['--version'], isolated: true });

    expect(ensureWithOptions).toHaveBeenCalledWith({ isolated: true });
    expect(runMock).toHaveBeenCalledWith(
      expect.arrayContaining(['sero-ws-1', 'node', '--version']),
      { timeoutMs: 120_000 },
    );
  });

  it('quotes Apple Container execFile args before using shell exec primitive', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const containerManager = { exec } as unknown as ContainerManager;
    const backend = new AppleContainerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/host/workspace',
      workspaceManager,
      containerManager,
    });
    vi.spyOn(backend, 'ensure').mockResolvedValue({
      backend: 'apple-container',
      workspaceId: 'ws-1',
      hostWorkspacePath: '/host/workspace',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
    });

    await backend.execFile({
      program: 'node',
      args: ['-e', "console.log('safe')"],
      cwd: '/workspace',
      env: { FOO: "bar'baz" },
      timeoutMs: 5_000,
    });

    expect(exec).toHaveBeenCalledWith(
      'ws-1',
      expect.stringContaining("FOO='bar'\\''baz' 'node' '-e'"),
      '/workspace',
      5_000,
      { injectGitAuth: undefined },
    );
    expect(exec.mock.calls[0][1]).toContain("console.log('\\''safe'\\'')");
  });
});
