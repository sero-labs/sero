import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import type { OpenShellRemoteGatewayInput } from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';

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
    checkRemoteDocker: vi.fn(),
    ensureRemoteGatewayEndpoint: vi.fn(),
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
      getPath: vi.fn(() => '/repo-remote'),
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

vi.mock('@electron/features/workspace/runtime/openshell/remote-gateway-registry', () => ({
  OpenShellRemoteGatewayRegistry: vi.fn(function OpenShellRemoteGatewayRegistry() {
    return {
      list: mocks.registryList,
      upsert: mocks.registryUpsert,
      remove: mocks.registryRemove,
    };
  }),
  getOpenShellRemoteConnectionMode: vi.fn((entry: { connectionMode?: 'ssh-tunnel' | 'direct' }) => entry.connectionMode ?? 'ssh-tunnel'),
  getOpenShellRemoteLocalPort: vi.fn((entry: { port: number; localPort?: number }) => entry.localPort ?? entry.port),
}));

vi.mock('@electron/features/workspace/runtime/openshell/remote-ssh', () => ({
  checkRemoteDocker: mocks.checkRemoteDocker,
}));

vi.mock('@electron/features/workspace/runtime/openshell/remote-gateway', () => ({
  ensureRemoteGatewayEndpoint: mocks.ensureRemoteGatewayEndpoint,
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

describe('workspace OpenShell Remote IPC', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.registryList.mockReset();
    mocks.registryUpsert.mockReset();
    mocks.registryRemove.mockReset();
    mocks.checkRemoteDocker.mockReset();
    mocks.ensureRemoteGatewayEndpoint.mockReset();
    mocks.createWorkspaceRuntimeFacade.mockReset();
  });

  it('routes registry IPC through the main-process registry and helper diagnostics', async () => {
    const input: OpenShellRemoteGatewayInput = {
      id: 'remote-1',
      name: 'sero-remote-dev',
      sshHost: 'dev@example.test',
      port: 8080,
    };
    const saved = { ...input, createdAt: '2026-05-05T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z' };
    mocks.registryList.mockResolvedValue([saved]);
    mocks.registryUpsert.mockResolvedValue(saved);
    mocks.registryRemove.mockResolvedValue(undefined);
    mocks.checkRemoteDocker.mockResolvedValue({ ok: true, status: 'ready', message: 'Remote Docker is running: 25' });
    mocks.ensureRemoteGatewayEndpoint.mockResolvedValue({
      ok: true,
      status: 'ready',
      message: 'gateway ok',
      gatewayName: 'sero-remote-dev-ssh-tunnel',
      localEndpoint: 'https://127.0.0.1:8080',
      localPort: 8080,
    });

    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    const listHandler = getHandler<() => Promise<unknown>>(IpcChannels.workspace.listOpenShellRemoteGateways);
    const saveHandler = getHandler<(event: unknown, entry: OpenShellRemoteGatewayInput) => Promise<unknown>>(
      IpcChannels.workspace.saveOpenShellRemoteGateway,
    );
    const removeHandler = getHandler<(event: unknown, id: string) => Promise<void>>(
      IpcChannels.workspace.removeOpenShellRemoteGateway,
    );
    const testHandler = getHandler<(event: unknown, entry: OpenShellRemoteGatewayInput) => Promise<unknown>>(
      IpcChannels.workspace.testOpenShellRemoteGateway,
    );

    await expect(listHandler()).resolves.toEqual([saved]);
    await expect(saveHandler({}, input)).resolves.toEqual(saved);
    await removeHandler({}, 'remote-1');
    await expect(testHandler({}, input)).resolves.toMatchObject({
      gatewayId: 'remote-1',
      gatewayName: 'sero-remote-dev',
      sshHost: 'dev@example.test',
      status: 'ready',
      connectionMode: 'ssh-tunnel',
      localEndpoint: 'https://127.0.0.1:8080',
      localPort: 8080,
      latencyMs: expect.any(Number),
    });

    expect(mocks.registryUpsert).toHaveBeenCalledWith(input);
    expect(mocks.registryRemove).toHaveBeenCalledWith('remote-1');
    expect(mocks.checkRemoteDocker).toHaveBeenCalledWith(input);
    expect(mocks.ensureRemoteGatewayEndpoint).toHaveBeenCalledWith(input);
  });

  it('propagates tunnel failure diagnostics through remote gateway test IPC', async () => {
    const input: OpenShellRemoteGatewayInput = {
      id: 'remote-1',
      name: 'sero-remote-dev',
      sshHost: 'dev@example.test',
      port: 8080,
      localPort: 19080,
    };
    mocks.checkRemoteDocker.mockResolvedValue({ ok: true, status: 'ready', message: 'Remote Docker is running: 25' });
    mocks.ensureRemoteGatewayEndpoint.mockResolvedValue({
      ok: false,
      status: 'unavailable',
      message: 'Local SSH tunnel port 127.0.0.1:19080 is already in use.',
      diagnosticCode: 'local-port-conflict',
      localEndpoint: 'https://127.0.0.1:19080',
      localPort: 19080,
    });

    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    const testHandler = getHandler<(event: unknown, entry: OpenShellRemoteGatewayInput) => Promise<unknown>>(
      IpcChannels.workspace.testOpenShellRemoteGateway,
    );

    await expect(testHandler({}, input)).resolves.toMatchObject({
      gatewayId: 'remote-1',
      gatewayName: 'sero-remote-dev',
      sshHost: 'dev@example.test',
      status: 'unavailable',
      connectionMode: 'ssh-tunnel',
      diagnosticCode: 'local-port-conflict',
      localEndpoint: 'https://127.0.0.1:19080',
      localPort: 19080,
      message: expect.stringContaining('127.0.0.1:19080'),
    });
    expect(mocks.ensureRemoteGatewayEndpoint).toHaveBeenCalledWith(input);
  });

  it('adds ready remote runtime diagnostics with latency and status details', async () => {
    const runtimeConfig: WorkspaceRuntimeConfig = {
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
      gatewayName: 'sero-remote-dev',
      sandboxName: 'sero-ws-remote',
      experimental: true,
    };
    const gateway = {
      id: 'remote-1',
      name: 'sero-remote-dev',
      sshHost: 'dev@example.test',
      port: 8080,
      createdAt: '2026-05-05T00:00:00.000Z',
      updatedAt: '2026-05-05T00:00:00.000Z',
    };
    mocks.registryList.mockResolvedValue([gateway]);
    mocks.checkRemoteDocker.mockResolvedValue({ ok: true, status: 'ready', message: 'Remote Docker is running: 25' });
    mocks.ensureRemoteGatewayEndpoint.mockResolvedValue({
      ok: true,
      status: 'ready',
      message: 'OpenShell Remote gateway sero-remote-dev-ssh-tunnel is reachable.',
      gatewayName: 'sero-remote-dev-ssh-tunnel',
      localEndpoint: 'https://127.0.0.1:8080',
      localPort: 8080,
    });
    mocks.createWorkspaceRuntimeFacade.mockResolvedValue(createRemoteRuntime(runtimeConfig));

    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    const diagnosticsHandler = getHandler<(event: unknown, workspaceId?: string) => Promise<unknown[]>>(
      IpcChannels.workspace.runtimeDiagnostics,
    );
    const diagnostics = await diagnosticsHandler({}, 'ws-remote');

    expect(diagnostics[0]).toMatchObject({
      providerId: 'openshell-remote',
      runtimeConfig,
      openShellRemote: {
        gatewayId: 'remote-1',
        gatewayName: 'sero-remote-dev',
        sshHost: 'dev@example.test',
        sandboxName: 'sero-ws-remote',
        status: 'ready',
        connectionMode: 'ssh-tunnel',
        localEndpoint: 'https://127.0.0.1:8080',
        localPort: 8080,
        latencyMs: expect.any(Number),
      },
    });
    expect(mocks.checkRemoteDocker).toHaveBeenCalledWith(gateway);
    expect(mocks.ensureRemoteGatewayEndpoint).toHaveBeenCalledWith(gateway);
  });

  it('adds actionable missing-entry diagnostics without failing the diagnostics response', async () => {
    const runtimeConfig: WorkspaceRuntimeConfig = {
      providerId: 'openshell-remote',
      remoteGatewayId: 'missing-gateway',
      gatewayName: 'sero-missing',
      sandboxName: 'sero-ws-remote',
      experimental: true,
    };
    mocks.registryList.mockResolvedValue([]);
    mocks.createWorkspaceRuntimeFacade.mockResolvedValue(createRemoteRuntime(runtimeConfig));

    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    const diagnosticsHandler = getHandler<(event: unknown, workspaceId?: string) => Promise<unknown[]>>(
      IpcChannels.workspace.runtimeDiagnostics,
    );
    const diagnostics = await diagnosticsHandler({}, 'ws-remote');

    expect(diagnostics[0]).toMatchObject({
      providerId: 'openshell-remote',
      openShellRemote: {
        gatewayId: 'missing-gateway',
        gatewayName: 'sero-missing',
        sandboxName: 'sero-ws-remote',
        status: 'unavailable',
      },
    });
    expect(mocks.checkRemoteDocker).not.toHaveBeenCalled();
    expect(mocks.ensureRemoteGatewayEndpoint).not.toHaveBeenCalled();
  });
});

function getHandler<T extends (...args: never[]) => unknown>(channel: string): T {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler for ${channel}`);
  return handler as unknown as T;
}

function createRemoteRuntime(runtimeConfig: WorkspaceRuntimeConfig) {
  return {
    workspaceId: 'ws-remote',
    workspacePath: '/repo-remote',
    providerId: 'openshell-remote' as const,
    actualRuntime: 'openshell-remote' as const,
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
      workspaceId: 'ws-remote',
      workspacePath: '/repo-remote',
      desiredRuntime: 'openshell-remote' as const,
      actualRuntime: 'openshell-remote' as const,
      containerEnabled: false,
      providerId: 'openshell-remote' as const,
      runtimeConfig,
      capabilityAudit: [],
    },
    health: vi.fn(async () => ({ providerId: 'openshell-remote' as const, status: 'unavailable' as const })),
    exec: vi.fn(),
    createTerminal: vi.fn(),
  };
}
