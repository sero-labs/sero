import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { WorkspaceRuntimeResolution } from '@electron/features/workspace/runtime-resolution';
import { createWorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/runtime-facade';

describe('createWorkspaceRuntimeFacade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chooses the host adapter for explicit host mode', async () => {
    const resolution = createResolution({
      desiredRuntime: 'host',
      actualRuntime: 'host',
      containerEnabled: false,
    });
    const deps = createDeps(resolution);

    const facade = await createWorkspaceRuntimeFacade('ws-1', { deps });

    expect(deps.resolveWorkspaceRuntime).toHaveBeenCalledWith('ws-1');
    expect(facade).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      providerId: 'host',
      actualRuntime: 'host',
    });
    expect(facade.resolution).toBe(resolution);
    expect(facade.fallbackReason).toBeUndefined();
    expect(facade.capabilities.directFileRead).toBe(true);
  });

  it('chooses the host adapter for container-unavailable fallback', async () => {
    const fallbackReason = 'Container mode is enabled, but Sero is falling back to host mode.';
    const resolution = createResolution({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      containerEnabled: true,
      fallbackCode: 'container_unavailable',
      fallbackReason,
    });
    const deps = createDeps(resolution);

    const facade = await createWorkspaceRuntimeFacade('ws-1', { deps });

    expect(facade.providerId).toBe('host');
    expect(facade.actualRuntime).toBe('host');
    expect(facade.fallbackReason).toBe(fallbackReason);
    expect(facade.resolution.fallbackReason).toBe(fallbackReason);
    expect(facade.capabilities.browserAutomation).toBe(false);
  });

  it('chooses the OpenShell Local adapter when the provider is OpenShell Local', async () => {
    const resolution = createResolution({
      desiredRuntime: 'openshell-local',
      actualRuntime: 'openshell-local',
      containerEnabled: false,
      providerId: 'openshell-local',
    });
    const deps = createDeps(resolution);
    const openShellAdapter = createAdapter('openshell-local', 'openshell-local');
    const createOpenShellLocalRuntimeAdapter = vi.fn(() => openShellAdapter);

    const facade = await createWorkspaceRuntimeFacade('ws-1', {
      deps: { ...deps, createOpenShellLocalRuntimeAdapter },
    });

    expect(createOpenShellLocalRuntimeAdapter).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      workspaceManager: deps.workspaceManager,
      terminals: deps.containerManager.terminals,
    });
    expect(facade).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      providerId: 'openshell-local',
      actualRuntime: 'openshell-local',
    });
    expect(facade.capabilities.browserAutomation).toBe(false);
  });

  it('chooses the OpenShell Remote adapter when the provider is OpenShell Remote', async () => {
    const resolution = createResolution({
      desiredRuntime: 'openshell-remote',
      actualRuntime: 'openshell-remote',
      containerEnabled: false,
      providerId: 'openshell-remote',
    });
    const deps = createDeps(resolution);
    const openShellAdapter = createAdapter('openshell-remote', 'openshell-remote');
    const createOpenShellRemoteRuntimeAdapter = vi.fn(() => openShellAdapter);

    const facade = await createWorkspaceRuntimeFacade('ws-1', {
      deps: { ...deps, createOpenShellRemoteRuntimeAdapter },
    });

    expect(createOpenShellRemoteRuntimeAdapter).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      workspaceManager: deps.workspaceManager,
      terminals: deps.containerManager.terminals,
      gatewayRegistry: expect.any(Object),
    });
    expect(facade).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      providerId: 'openshell-remote',
      actualRuntime: 'openshell-remote',
    });
    expect(facade.capabilities.browserAutomation).toBe(false);
  });

  it('chooses the OpenShell Cloud adapter when the provider is OpenShell Cloud', async () => {
    const resolution = createResolution({
      desiredRuntime: 'openshell-cloud',
      actualRuntime: 'openshell-cloud',
      containerEnabled: false,
      providerId: 'openshell-cloud',
    });
    const deps = createDeps(resolution);
    const openShellAdapter = createAdapter('openshell-cloud', 'openshell-cloud');
    const createOpenShellCloudRuntimeAdapter = vi.fn(() => openShellAdapter);

    const facade = await createWorkspaceRuntimeFacade('ws-1', {
      deps: { ...deps, createOpenShellCloudRuntimeAdapter },
    });

    expect(createOpenShellCloudRuntimeAdapter).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      workspaceManager: deps.workspaceManager,
      terminals: deps.containerManager.terminals,
      gatewayRegistry: expect.any(Object),
    });
    expect(facade).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      providerId: 'openshell-cloud',
      actualRuntime: 'openshell-cloud',
    });
    expect(facade.capabilities.browserAutomation).toBe(false);
  });

  it('chooses the Apple container adapter for running container mode', async () => {
    const resolution = createResolution({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled: true,
    });
    const deps = createDeps(resolution);

    const facade = await createWorkspaceRuntimeFacade('ws-1', { deps });

    expect(facade.providerId).toBe('apple-container');
    expect(facade.actualRuntime).toBe('container');
    expect(facade.resolution).toBe(resolution);
    expect(facade.capabilities.browserAutomation).toBe(true);
    expect(facade.capabilities.portDiscovery).toBe(true);
  });

  it('passes selected runtime metadata through terminal creation', async () => {
    const pty = { pid: 123 };
    const resolution = createResolution({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      containerEnabled: true,
      fallbackCode: 'container_unavailable',
      fallbackReason: 'fallback unchanged',
    });
    const deps = createDeps(resolution, pty);

    const facade = await createWorkspaceRuntimeFacade('ws-1', { deps });
    const session = await facade.createTerminal({ terminalId: 'term-1', cols: 120, rows: 32 });

    expect(deps.containerManager.terminals.createHostTerminal).toHaveBeenCalledWith(
      'ws-1',
      'term-1',
      '/tmp/ws',
      120,
      32,
    );
    expect(session).toEqual({ pty, runtime: 'host' });
    expect(facade.fallbackReason).toBe('fallback unchanged');
  });
});

function createDeps(resolution: WorkspaceRuntimeResolution, pty: unknown = { pid: 1 }) {
  const containerManager = {
    terminals: {
      createHostTerminal: vi.fn(() => pty),
      createTerminal: vi.fn(() => pty),
    },
    inspect: vi.fn(),
    ensure: vi.fn(),
    exec: vi.fn(),
  } as unknown as ContainerManager;

  return {
    resolveWorkspaceRuntime: vi.fn(async () => resolution),
    workspaceManager: {
      getReferences: vi.fn(),
      getMounts: vi.fn(),
      getRoots: vi.fn(),
    } as unknown as WorkspaceManager,
    containerManager,
  };
}

function createResolution(
  overrides: Pick<
    WorkspaceRuntimeResolution,
    'desiredRuntime' | 'actualRuntime' | 'containerEnabled'
  > & Partial<Pick<WorkspaceRuntimeResolution, 'providerId' | 'fallbackCode' | 'fallbackReason'>>,
): WorkspaceRuntimeResolution {
  return {
    workspaceId: 'ws-1',
    workspacePath: '/tmp/ws',
    capabilityAudit: [],
    ...overrides,
  };
}

function createAdapter(
  providerId: 'host' | 'apple-container' | 'openshell-local' | 'openshell-remote' | 'openshell-cloud',
  actualRuntime: 'host' | 'container' | 'openshell-local' | 'openshell-remote' | 'openshell-cloud',
) {
  return {
    providerId,
    actualRuntime,
    capabilities: {
      exec: true,
      interactiveTerminal: !isOpenShellRuntime(actualRuntime),
      directFileRead: actualRuntime === 'host',
      directFileWrite: actualRuntime === 'host',
      fileUpload: isOpenShellRuntime(actualRuntime),
      fileDownload: isOpenShellRuntime(actualRuntime),
      managedDevServers: actualRuntime !== 'host',
      browserAutomation: actualRuntime === 'container',
      portDiscovery: actualRuntime === 'container',
      portForward: isOpenShellRuntime(actualRuntime),
      logStream: isOpenShellRuntime(actualRuntime),
    },
    health: vi.fn(),
    exec: vi.fn(),
    createTerminal: vi.fn(),
  };
}

function isOpenShellRuntime(
  actualRuntime: 'host' | 'container' | 'openshell-local' | 'openshell-remote' | 'openshell-cloud',
): boolean {
  return actualRuntime === 'openshell-local'
    || actualRuntime === 'openshell-remote'
    || actualRuntime === 'openshell-cloud';
}
