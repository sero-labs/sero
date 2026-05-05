import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import type { OpenShellCloudGatewayInput } from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    registryList: vi.fn(),
    registryUpsert: vi.fn(),
    registryRemove: vi.fn(),
    registerCloudGateway: vi.fn(),
    loginCloudGateway: vi.fn(),
    getCloudGatewayDiagnostics: vi.fn(),
    cloudDestroy: vi.fn(),
    workspaceManager: {
      list: vi.fn(async () => []),
      create: vi.fn(),
      remove: vi.fn(),
      getConfig: vi.fn(),
      addFolder: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      setExpanded: vi.fn(),
      inferWorkspace: vi.fn(),
      setContainerEnabled: vi.fn(),
      setRuntimeConfig: vi.fn(),
      getRuntimeConfig: vi.fn(),
      getPath: vi.fn(() => '/repo-cloud'),
      addReference: vi.fn(),
      removeReference: vi.fn(),
      addMount: vi.fn(),
      removeMount: vi.fn(),
      getRoots: vi.fn(),
      addRoot: vi.fn(),
      removeRoot: vi.fn(),
      renameRoot: vi.fn(),
    },
    createWorkspaceRuntimeFacade: vi.fn(),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/features/workspace/runtime/runtime-facade', () => ({
  createWorkspaceRuntimeFacade: mocks.createWorkspaceRuntimeFacade,
}));

vi.mock('@electron/features/workspace/runtime/openshell/cloud-gateway-registry', () => ({
  OpenShellCloudGatewayRegistry: vi.fn(function OpenShellCloudGatewayRegistry() {
    return {
      list: mocks.registryList,
      upsert: mocks.registryUpsert,
      remove: mocks.registryRemove,
    };
  }),
}));

vi.mock('@electron/features/workspace/runtime/openshell/cloud-gateway', () => ({
  registerCloudGateway: mocks.registerCloudGateway,
  loginCloudGateway: mocks.loginCloudGateway,
  getCloudGatewayDiagnostics: mocks.getCloudGatewayDiagnostics,
}));

vi.mock('@electron/features/workspace/runtime/adapters/openshell-cloud-runtime-adapter', () => ({
  createOpenShellCloudRuntimeAdapter: vi.fn(() => ({ destroy: mocks.cloudDestroy })),
}));

vi.mock('@electron/features/workspace/runtime/openshell/remote-gateway-registry', () => ({
  OpenShellRemoteGatewayRegistry: vi.fn(function OpenShellRemoteGatewayRegistry() {
    return { list: vi.fn(), upsert: vi.fn(), remove: vi.fn() };
  }),
}));

vi.mock('@electron/features/workspace/runtime/openshell/remote-ssh', () => ({
  checkRemoteDocker: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/remote-gateway', () => ({
  measureRemoteGatewayLatency: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/policy-diagnostics', () => ({
  getOpenShellPolicyDiagnostics: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/adapters/openshell-local-runtime-adapter', () => ({
  DEFAULT_GATEWAY_NAME: 'sero-local',
  getDefaultOpenShellSandboxName: (workspaceId: string) => `sero-${workspaceId}`,
  createOpenShellLocalRuntimeAdapter: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/adapters/openshell-remote-runtime-adapter', () => ({
  createOpenShellRemoteRuntimeAdapter: vi.fn(),
}));

vi.mock('@electron/features/workspace/plugin-validation', () => ({
  assertIsSeroPluginFolder: vi.fn(),
}));

vi.mock('@electron/features/workspace/container-sync', () => ({
  recreateContainerIfRunning: vi.fn(),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  appRuntimeManager: { reconcile: vi.fn() },
  containerManager: { terminals: {} },
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: vi.fn(),
}));

describe('workspace OpenShell Cloud IPC', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.registryList.mockReset();
    mocks.registryUpsert.mockReset();
    mocks.registryRemove.mockReset();
    mocks.registerCloudGateway.mockReset();
    mocks.loginCloudGateway.mockReset();
    mocks.getCloudGatewayDiagnostics.mockReset();
    mocks.cloudDestroy.mockReset();
    mocks.workspaceManager.getPath.mockReset();
    mocks.workspaceManager.getPath.mockReturnValue('/repo-cloud');
    mocks.createWorkspaceRuntimeFacade.mockReset();
  });

  it('routes cloud registry, test, and login IPC through main-process helpers', async () => {
    const input: OpenShellCloudGatewayInput = {
      id: 'openshell-cloud-prod',
      name: 'sero-cloud-prod',
      endpoint: 'https://cloud.example.test',
      authMode: 'browser',
      resourceLabel: '2 CPU / 4 GB',
      costLabel: '$1/hr advisory',
      idleTimeoutMinutes: 30,
    };
    const saved = {
      ...input,
      idleTimeoutMinutes: 30,
      createdAt: '2026-05-05T00:00:00.000Z',
      updatedAt: '2026-05-05T00:00:00.000Z',
    };
    const diagnostics = {
      gatewayId: input.id,
      gatewayName: input.name,
      endpoint: input.endpoint,
      status: 'ready' as const,
      message: 'cloud ready',
      latencyMs: 24,
      stale: false,
    };
    mocks.registryList.mockResolvedValue([saved]);
    mocks.registryUpsert.mockResolvedValue(saved);
    mocks.registryRemove.mockResolvedValue(undefined);
    mocks.registerCloudGateway.mockResolvedValue({ ok: true, status: 'ready', message: 'registered' });
    mocks.loginCloudGateway.mockResolvedValue({ ok: true, status: 'ready', message: 'logged in' });
    mocks.getCloudGatewayDiagnostics.mockResolvedValue(diagnostics);

    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    await expect(getHandler<() => Promise<unknown>>(IpcChannels.workspace.listOpenShellCloudGateways)())
      .resolves.toEqual([saved]);
    await expect(getHandler<(event: unknown, entry: OpenShellCloudGatewayInput) => Promise<unknown>>(
      IpcChannels.workspace.saveOpenShellCloudGateway,
    )({}, input)).resolves.toEqual(saved);
    await getHandler<(event: unknown, id: string) => Promise<void>>(
      IpcChannels.workspace.removeOpenShellCloudGateway,
    )({}, input.id);
    await expect(getHandler<(event: unknown, entry: OpenShellCloudGatewayInput) => Promise<unknown>>(
      IpcChannels.workspace.testOpenShellCloudGateway,
    )({}, input)).resolves.toEqual(diagnostics);
    await expect(getHandler<(event: unknown, id: string) => Promise<unknown>>(
      IpcChannels.workspace.loginOpenShellCloudGateway,
    )({}, input.id)).resolves.toEqual(diagnostics);

    expect(mocks.registryUpsert).toHaveBeenCalledWith(input);
    expect(mocks.registryRemove).toHaveBeenCalledWith(input.id);
    expect(mocks.registerCloudGateway).toHaveBeenCalledWith(input);
    expect(mocks.loginCloudGateway).toHaveBeenCalledWith(saved);
    expect(JSON.stringify(diagnostics)).not.toMatch(/token|secret-value/i);
  });

  it('destroys only the selected cloud workspace sandbox through the cloud adapter', async () => {
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    await getHandler<(event: unknown, workspaceId: string) => Promise<void>>(
      IpcChannels.workspace.destroyOpenShellCloudSandbox,
    )({}, 'ws-cloud');

    expect(mocks.cloudDestroy).toHaveBeenCalledTimes(1);
    expect(mocks.registryRemove).not.toHaveBeenCalled();
  });

  it('adds cloud diagnostics for cloud runtime workspaces', async () => {
    const runtimeConfig: WorkspaceRuntimeConfig = {
      providerId: 'openshell-cloud',
      cloudGatewayId: 'openshell-cloud-prod',
      gatewayName: 'sero-cloud-prod',
      sandboxName: 'sero-ws-cloud',
      idleTimeoutMinutes: 30,
      experimental: true,
    };
    const gateway = {
      id: 'openshell-cloud-prod',
      name: 'sero-cloud-prod',
      endpoint: 'https://cloud.example.test',
      authMode: 'browser' as const,
      idleTimeoutMinutes: 30,
      createdAt: '2026-05-05T00:00:00.000Z',
      updatedAt: '2026-05-05T00:00:00.000Z',
    };
    mocks.registryList.mockResolvedValue([gateway]);
    mocks.getCloudGatewayDiagnostics.mockResolvedValue({
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      endpoint: gateway.endpoint,
      sandboxName: 'sero-ws-cloud',
      status: 'ready',
      message: 'cloud ready',
      stale: false,
    });
    mocks.createWorkspaceRuntimeFacade.mockResolvedValue(createCloudRuntime(runtimeConfig));

    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    const diagnostics = await getHandler<(event: unknown, workspaceId?: string) => Promise<unknown[]>>(
      IpcChannels.workspace.runtimeDiagnostics,
    )({}, 'ws-cloud');

    expect(diagnostics[0]).toMatchObject({
      providerId: 'openshell-cloud',
      runtimeConfig,
      openShellCloud: {
        gatewayId: gateway.id,
        endpoint: gateway.endpoint,
        status: 'ready',
      },
    });
    expect(mocks.getCloudGatewayDiagnostics).toHaveBeenCalledWith(gateway, runtimeConfig);
  });
});

function getHandler<T extends (...args: never[]) => unknown>(channel: string): T {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler for ${channel}`);
  return handler as unknown as T;
}

function createCloudRuntime(runtimeConfig: WorkspaceRuntimeConfig) {
  return {
    workspaceId: 'ws-cloud',
    workspacePath: '/repo-cloud',
    providerId: 'openshell-cloud' as const,
    actualRuntime: 'openshell-cloud' as const,
    capabilities: {
      exec: true,
      interactiveTerminal: false,
      directFileRead: false,
      directFileWrite: false,
      managedDevServers: true,
      browserAutomation: false,
      portDiscovery: false,
    },
    resolution: {
      workspaceId: 'ws-cloud',
      workspacePath: '/repo-cloud',
      desiredRuntime: 'openshell-cloud' as const,
      actualRuntime: 'openshell-cloud' as const,
      containerEnabled: false,
      providerId: 'openshell-cloud' as const,
      runtimeConfig,
      capabilityAudit: [],
    },
    health: vi.fn(async () => ({ providerId: 'openshell-cloud' as const, status: 'ready' as const })),
    exec: vi.fn(),
    createTerminal: vi.fn(),
  };
}
