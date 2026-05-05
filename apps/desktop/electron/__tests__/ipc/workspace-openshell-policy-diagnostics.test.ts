import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
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
      getPath: vi.fn(() => '/repo-open'),
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
    getOpenShellPolicyDiagnostics: vi.fn(),
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

vi.mock('@electron/features/workspace/runtime/openshell/policy-diagnostics', () => ({
  getOpenShellPolicyDiagnostics: mocks.getOpenShellPolicyDiagnostics,
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

function createOpenShellRuntime(runtimeConfig: WorkspaceRuntimeConfig) {
  return {
    workspaceId: 'ws-open',
    workspacePath: '/repo-open',
    providerId: 'openshell-local',
    actualRuntime: 'openshell-local',
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
      workspaceId: 'ws-open',
      workspacePath: '/repo-open',
      desiredRuntime: 'openshell-local',
      actualRuntime: 'openshell-local',
      containerEnabled: false,
      providerId: 'openshell-local',
      runtimeConfig,
      capabilityAudit: [],
    },
    health: vi.fn(async () => ({ providerId: 'openshell-local', status: 'ready' })),
    exec: vi.fn(),
    createTerminal: vi.fn(),
  };
}

describe('workspace OpenShell policy diagnostics IPC', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.workspaceManager.setRuntimeConfig.mockClear();
    mocks.createWorkspaceRuntimeFacade.mockReset();
    mocks.getOpenShellPolicyDiagnostics.mockReset();
    mocks.getOpenShellPolicyDiagnostics.mockResolvedValue({
      selectedProfile: {
        id: 'dev',
        label: 'Dev',
        summary: 'Developer workflow profile.',
        filesystemAccess: [],
        networkAccess: [],
        processAccess: [],
        staticBoundaries: [],
        hotReloadableBoundaries: [],
        sandboxRecreationRequiredFor: [],
        unsupportedInCurrentCli: [],
      },
      enforcementStatus: 'profile-preview-only',
      enforcementMessage: 'Sero stores this profile as policy intent.',
      activePolicy: { available: false, summary: 'Unavailable.' },
      policyList: { available: false, summary: 'Unavailable.' },
      logSummary: { available: false, summary: 'Unavailable.' },
      blockedEvents: [],
      allowDenyPromptsSupported: false,
      allowDenyPromptsMessage: 'Unsupported.',
    });
  });

  it('uses OpenShell default gateway and sandbox names without mutating runtime config', async () => {
    const runtimeConfig: WorkspaceRuntimeConfig = { providerId: 'openshell-local', experimental: true };
    mocks.createWorkspaceRuntimeFacade.mockResolvedValueOnce(createOpenShellRuntime(runtimeConfig));
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');

    registerWorkspaceHandlers();

    const diagnosticsHandler = mocks.handlers.get(IpcChannels.workspace.runtimeDiagnostics) as
      | ((event: unknown, workspaceId?: string) => Promise<unknown[]>)
      | undefined;
    const diagnostics = await diagnosticsHandler?.({}, 'ws-open');

    expect(mocks.getOpenShellPolicyDiagnostics).toHaveBeenCalledWith({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-open',
      runtimeConfig,
    });
    expect(mocks.workspaceManager.setRuntimeConfig).not.toHaveBeenCalled();
    expect(diagnostics?.[0]).toMatchObject({
      openShellPolicy: {
        selectedProfile: { id: 'dev', label: 'Dev' },
        enforcementStatus: 'profile-preview-only',
        blockedEvents: [],
      },
    });
  });
});
