import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => {
  const openShellLocalDestroy = vi.fn(async () => {});
  const openShellRemoteDestroy = vi.fn(async () => {});

  return {
    openShellLocalDestroy,
    openShellRemoteDestroy,
    createOpenShellLocalRuntimeAdapter: vi.fn(() => ({ destroy: openShellLocalDestroy })),
    createOpenShellRemoteRuntimeAdapter: vi.fn(() => ({ destroy: openShellRemoteDestroy })),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: {},
}));

vi.mock('@electron/features/workspace/runtime/adapters/openshell-local-runtime-adapter', () => ({
  DEFAULT_GATEWAY_NAME: 'sero-local',
  getDefaultOpenShellSandboxName: (workspaceId: string) => `sero-${workspaceId}`,
  createOpenShellLocalRuntimeAdapter: mocks.createOpenShellLocalRuntimeAdapter,
}));

vi.mock('@electron/features/workspace/runtime/adapters/openshell-remote-runtime-adapter', () => ({
  createOpenShellRemoteRuntimeAdapter: mocks.createOpenShellRemoteRuntimeAdapter,
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  appRuntimeManager: { reconcile: vi.fn() },
  containerManager: { terminals: {} },
}));

vi.mock('@electron/features/workspace/runtime/openshell/policy-diagnostics', () => ({
  getOpenShellPolicyDiagnostics: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/runtime-facade', () => ({
  createWorkspaceRuntimeFacade: vi.fn(),
}));

vi.mock('@electron/features/workspace/plugin-validation', () => ({
  assertIsSeroPluginFolder: vi.fn(),
}));

vi.mock('@electron/features/workspace/container-sync', () => ({
  recreateContainerIfRunning: vi.fn(),
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: vi.fn(),
}));

import { destroyOpenShellSandboxBeforeRuntimeChange } from '@electron/ipc/workspace/workspace';

describe('OpenShell runtime switching cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('destroys a remote OpenShell sandbox when switching away without destroying the gateway', async () => {
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
      gatewayName: 'sero-remote',
      sandboxName: 'sero-ws-1',
      experimental: true,
    });
    const gatewayRegistry = { list: vi.fn(async () => []) };

    await destroyOpenShellSandboxBeforeRuntimeChange('ws-1', { providerId: 'host' }, {
      workspaceManager,
      openShellRemoteGatewayRegistry: gatewayRegistry,
    });

    expect(mocks.createOpenShellRemoteRuntimeAdapter).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workspacePath: '/repo-1',
      workspaceManager,
      terminals: {},
      gatewayRegistry,
    });
    expect(mocks.openShellRemoteDestroy).toHaveBeenCalledTimes(1);
    expect(mocks.createOpenShellLocalRuntimeAdapter).not.toHaveBeenCalled();
  });

  it('destroys the old local sandbox when switching between OpenShell providers', async () => {
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-local',
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      experimental: true,
    });

    await destroyOpenShellSandboxBeforeRuntimeChange('ws-1', {
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
    }, {
      workspaceManager,
      openShellRemoteGatewayRegistry: { list: vi.fn(async () => []) },
    });

    expect(mocks.createOpenShellLocalRuntimeAdapter).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workspacePath: '/repo-1',
      workspaceManager,
      terminals: {},
    });
    expect(mocks.openShellLocalDestroy).toHaveBeenCalledTimes(1);
    expect(mocks.createOpenShellRemoteRuntimeAdapter).not.toHaveBeenCalled();
  });

  it('keeps the existing OpenShell sandbox when the provider does not change', async () => {
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
      gatewayName: 'sero-remote',
      experimental: true,
    });

    await destroyOpenShellSandboxBeforeRuntimeChange('ws-1', {
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-2',
      gatewayName: 'sero-remote-2',
    }, {
      workspaceManager,
      openShellRemoteGatewayRegistry: { list: vi.fn(async () => []) },
    });

    expect(mocks.createOpenShellRemoteRuntimeAdapter).not.toHaveBeenCalled();
    expect(mocks.openShellRemoteDestroy).not.toHaveBeenCalled();
  });

  it('does not block switching away when remote sandbox cleanup fails', async () => {
    mocks.openShellRemoteDestroy.mockRejectedValueOnce(new Error('missing gateway registry entry'));
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
      gatewayName: 'sero-remote',
      experimental: true,
    });

    await expect(destroyOpenShellSandboxBeforeRuntimeChange('ws-1', { providerId: 'host' }, {
      workspaceManager,
      openShellRemoteGatewayRegistry: { list: vi.fn(async () => []) },
    })).resolves.toBeUndefined();

    expect(mocks.openShellRemoteDestroy).toHaveBeenCalledTimes(1);
  });
});

function createWorkspaceManager(runtime: WorkspaceRuntimeConfig) {
  return {
    getRuntimeConfig: vi.fn(async () => runtime),
    getPath: vi.fn(() => '/repo-1'),
  };
}
