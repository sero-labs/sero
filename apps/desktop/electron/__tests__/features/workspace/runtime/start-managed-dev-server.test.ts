import { describe, expect, it, vi } from 'vitest';

import { startManagedDevServer } from '@electron/features/workspace/runtime/start-managed-dev-server';
import { seroOwnedProcesses } from '@electron/features/git/worktree/pool/owned-processes';
import type { RuntimeBackend, RuntimeCapabilities, RuntimeDevServer } from '@electron/features/workspace/runtime/types';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';

const capabilities: RuntimeCapabilities = {
  exec: true,
  processes: { spawn: true, stdio: true, signal: true, longRunning: true },
  files: { read: true, write: true, edit: true, list: true, mutateTree: true, watch: true },
  vcs: { git: true, worktrees: true, pullRequests: true },
  terminal: true,
  devServers: { start: true, stop: true, restart: true, status: true },
  ports: { discover: true, forward: true, stopForward: true, previewUrl: true },
  logs: true,
  browserAutomation: false,
  languageServers: true,
};

function createManager(serverResult: RuntimeDevServer | Error): RuntimeManager {
  const runtime = {
    backend: 'host',
    capabilities,
    startDevServer: vi.fn(async () => {
      if (serverResult instanceof Error) throw serverResult;
      return serverResult;
    }),
  } satisfies Pick<RuntimeBackend, 'backend' | 'capabilities' | 'startDevServer'>;

  return {
    getRuntime: vi.fn(async () => runtime),
  } as unknown as RuntimeManager;
}

describe('startManagedDevServer', () => {
  it('starts a runtime dev server with a provider-neutral runtime cwd', async () => {
    const server = {
      id: 'server-1',
      port: 5173,
      url: 'http://127.0.0.1:5173',
      command: 'pnpm dev',
      cwd: '/workspace/app',
      status: 'running',
    } satisfies RuntimeDevServer;
    const manager = createManager(server);

    const result = await startManagedDevServer({
      workspaceId: 'workspace-a',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace/app',
      command: 'pnpm dev',
    }, { runtimeManager: manager });

    const runtime = await manager.getRuntime('workspace-a');
    expect(runtime.startDevServer).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/workspace/app' }));
    expect(result).toEqual({ serverId: 'server-1', url: 'http://127.0.0.1:5173', port: 5173 });
  });

  it('returns a reason when runtime dev-server start throws', async () => {
    const manager = createManager(new Error('No listening port was detected after starting the command.'));

    const result = await startManagedDevServer({
      workspaceId: 'workspace-a',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace',
      command: 'pnpm dev',
    }, { runtimeManager: manager });

    expect(result).toEqual({ reason: 'No listening port was detected after starting the command.' });
  });

  it('returns a reason for failed or malformed runtime server results', async () => {
    const failedManager = createManager({
      id: 'failed-server',
      port: 0,
      url: '',
      command: 'pnpm dev',
      cwd: '/workspace',
      status: 'failed',
      diagnosticCode: 'dev-server-port-detect-timeout',
    });
    const malformedManager = createManager({
      id: 'malformed-server',
      port: 0,
      url: '',
      command: 'pnpm dev',
      cwd: '/workspace',
      status: 'running',
    });

    await expect(startManagedDevServer({
      workspaceId: 'workspace-a',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace',
      command: 'pnpm dev',
    }, { runtimeManager: failedManager })).resolves.toEqual({ reason: 'dev-server-port-detect-timeout' });

    await expect(startManagedDevServer({
      workspaceId: 'workspace-a',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace',
      command: 'pnpm dev',
    }, { runtimeManager: malformedManager })).resolves.toEqual({ reason: 'Managed dev server failed to start.' });
  });

  it('registers a container dev server with the host path and stops it through its runtime owner', async () => {
    const stopDevServer = vi.fn(async () => undefined);
    const runtime = {
      backend: 'docker',
      capabilities,
      startDevServer: vi.fn(async () => ({
        id: 'container-server',
        port: 5173,
        url: 'http://127.0.0.1:5173',
        command: 'pnpm dev',
        cwd: '/workspace/.sero/worktrees/slot-1',
        status: 'running' as const,
      })),
      stopDevServer,
    } satisfies Pick<RuntimeBackend, 'backend' | 'capabilities' | 'startDevServer' | 'stopDevServer'>;
    const manager = {
      getRuntime: vi.fn(async () => runtime),
      onDevServerChange: vi.fn(() => () => undefined),
    } as unknown as RuntimeManager;
    const cwdPath = '/tmp/workspace/.sero/worktrees/slot-1';

    await startManagedDevServer({
      workspaceId: 'workspace-a',
      workspacePath: '/tmp/workspace',
      cwdPath,
      command: 'pnpm dev',
    }, { runtimeManager: manager });
    expect(seroOwnedProcesses.listRootedIn(cwdPath)).toHaveLength(1);
    expect(await seroOwnedProcesses.stopRootedIn(cwdPath)).toEqual([]);
    expect(stopDevServer).toHaveBeenCalledWith({ serverId: 'container-server' });
    expect(seroOwnedProcesses.listRootedIn(cwdPath)).toHaveLength(0);
  });
});
