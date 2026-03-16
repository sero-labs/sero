import { describe, expect, it, vi } from 'vitest';

import { refreshWorkspaceRuntimeAfterSync } from '../../kanban/workspace-runtime-refresh';

describe('refreshWorkspaceRuntimeAfterSync', () => {
  it('installs dependencies and restarts registered dev servers', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'installed',
      stderr: '',
      exitCode: 0,
    });
    const restartDevServer = vi.fn().mockResolvedValue(true);

    const result = await refreshWorkspaceRuntimeAfterSync(
      'workspace-1',
      '/tmp/workspace',
      {
        detectInstallCommand: vi.fn().mockResolvedValue('pnpm install --frozen-lockfile'),
        detectDevCommand: vi.fn().mockResolvedValue('pnpm run dev'),
        runCommand,
        listDevServers: vi.fn().mockReturnValue([
          {
            id: 'workspace-1:3000',
            workspaceId: 'workspace-1',
            name: 'Vite Dev Server',
            port: 3000,
            url: 'http://127.0.0.1:3000',
            command: 'pnpm run dev -- --host 0.0.0.0 --port 3000',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
        ]),
        restartDevServer,
        autoStartDevServer: vi.fn(),
        isContainerEnabled: vi.fn().mockResolvedValue(true),
      },
    );

    expect(runCommand).toHaveBeenCalledWith(
      'workspace-1',
      '/tmp/workspace',
      'pnpm install --frozen-lockfile',
      600_000,
    );
    expect(restartDevServer).toHaveBeenCalledWith('workspace-1:3000');
    expect(result).toMatchObject({
      refreshed: true,
      dependenciesInstalled: true,
      restartedServerIds: ['workspace-1:3000'],
    });
  });

  it('auto-starts a dev server when none are registered', async () => {
    const autoStartDevServer = vi.fn().mockResolvedValue({
      serverId: 'workspace-1:5173',
    });

    const result = await refreshWorkspaceRuntimeAfterSync(
      'workspace-1',
      '/tmp/workspace',
      {
        detectInstallCommand: vi.fn().mockResolvedValue(null),
        detectDevCommand: vi.fn().mockResolvedValue('pnpm run dev'),
        runCommand: vi.fn(),
        listDevServers: vi.fn().mockReturnValue([]),
        restartDevServer: vi.fn(),
        autoStartDevServer,
        isContainerEnabled: vi.fn().mockResolvedValue(true),
      },
    );

    expect(autoStartDevServer).toHaveBeenCalledWith(
      'workspace-1',
      '/tmp/workspace',
      'pnpm run dev',
    );
    expect(result).toMatchObject({
      refreshed: true,
      autoStartedServerId: 'workspace-1:5173',
    });
  });

  it('stops before restarting dev servers when dependency install fails', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'lockfile mismatch',
      exitCode: 1,
    });
    const restartDevServer = vi.fn();

    const result = await refreshWorkspaceRuntimeAfterSync(
      'workspace-1',
      '/tmp/workspace',
      {
        detectInstallCommand: vi.fn().mockResolvedValue('pnpm install --frozen-lockfile'),
        detectDevCommand: vi.fn().mockResolvedValue('pnpm run dev'),
        runCommand,
        listDevServers: vi.fn().mockReturnValue([
          {
            id: 'workspace-1:3000',
            workspaceId: 'workspace-1',
            name: 'Vite Dev Server',
            port: 3000,
            url: 'http://127.0.0.1:3000',
            command: 'pnpm run dev -- --host 0.0.0.0 --port 3000',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
        ]),
        restartDevServer,
        autoStartDevServer: vi.fn(),
        isContainerEnabled: vi.fn().mockResolvedValue(true),
      },
    );

    expect(restartDevServer).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(false);
    expect(result.reason).toContain('Dependency install failed');
  });
});
