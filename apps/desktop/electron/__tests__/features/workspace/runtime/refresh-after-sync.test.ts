import { describe, expect, it, vi } from 'vitest';

import { refreshWorkspaceRuntimeAfterSync } from '@electron/features/workspace/runtime/refresh-after-sync';

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
            id: 'workspace-1:workspace:root:3000',
            workspaceId: 'workspace-1',
            name: 'Vite Dev Server',
            port: 3000,
            url: 'http://127.0.0.1:3000',
            command: 'pnpm run dev -- --host 0.0.0.0 --port 3000',
            cwd: '/workspace',
            scope: 'workspace',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
          {
            id: 'workspace-1:card-preview:9:4173',
            workspaceId: 'workspace-1',
            name: 'Card #9 Preview',
            port: 4173,
            url: 'http://127.0.0.1:4173',
            command: 'pnpm run dev',
            cwd: '/workspace/.sero/worktrees/card-9',
            scope: 'card-preview',
            cardId: '9',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
        ]),
        restartDevServer,
        autoStartDevServer: vi.fn(),
        resolveRuntime: vi.fn(),
      },
    );

    expect(runCommand).toHaveBeenCalledWith(
      'workspace-1',
      '/tmp/workspace',
      'pnpm install --frozen-lockfile',
      600_000,
    );
    expect(restartDevServer).toHaveBeenCalledWith('workspace-1:workspace:root:3000');
    expect(result).toMatchObject({
      refreshed: true,
      dependenciesInstalled: true,
      restartedServerIds: ['workspace-1:workspace:root:3000'],
    });
  });

  it('auto-starts a dev server when none are registered', async () => {
    const autoStartDevServer = vi.fn().mockResolvedValue({
      serverId: 'workspace-1:workspace:root:5173',
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
        resolveRuntime: vi.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          workspacePath: '/tmp/workspace',
          desiredRuntime: 'container',
          actualRuntime: 'container',
          containerEnabled: true,
          capabilityAudit: [],
        }),
      },
    );

    expect(autoStartDevServer).toHaveBeenCalledWith(
      'workspace-1',
      '/tmp/workspace',
      'pnpm run dev',
    );
    expect(result).toMatchObject({
      refreshed: true,
      autoStartedServerId: 'workspace-1:workspace:root:5173',
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
            id: 'workspace-1:workspace:root:3000',
            workspaceId: 'workspace-1',
            name: 'Vite Dev Server',
            port: 3000,
            url: 'http://127.0.0.1:3000',
            command: 'pnpm run dev -- --host 0.0.0.0 --port 3000',
            cwd: '/workspace',
            scope: 'workspace',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
        ]),
        restartDevServer,
        autoStartDevServer: vi.fn(),
        resolveRuntime: vi.fn(),
      },
    );

    expect(restartDevServer).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(false);
    expect(result.reason).toContain('Dependency install failed');
  });

  it('returns an explicit host-mode reason when auto-starting managed dev servers is unavailable', async () => {
    const result = await refreshWorkspaceRuntimeAfterSync(
      'workspace-1',
      '/tmp/workspace',
      {
        detectInstallCommand: vi.fn().mockResolvedValue(null),
        detectDevCommand: vi.fn().mockResolvedValue('pnpm run dev'),
        runCommand: vi.fn(),
        listDevServers: vi.fn().mockReturnValue([]),
        restartDevServer: vi.fn(),
        autoStartDevServer: vi.fn(),
        resolveRuntime: vi.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          workspacePath: '/tmp/workspace',
          desiredRuntime: 'container',
          actualRuntime: 'host',
          containerEnabled: true,
          fallbackCode: 'container_unavailable',
          fallbackReason: 'falling back to host mode',
          capabilityAudit: [
            {
              key: 'managedDevServers',
              label: 'Managed preview/dev servers',
              available: false,
              containerOnly: true,
              detail: 'Managed preview/dev-server automation remains container-only while this workspace is running on the host.',
            },
          ],
        }),
      },
    );

    expect(result).toMatchObject({
      refreshed: false,
      reason: 'Managed preview/dev-server automation remains container-only while this workspace is running on the host.',
    });
  });
});
