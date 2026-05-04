import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { WorkspaceInfo } from '@/types/ipc';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const createdWorkspace: WorkspaceInfo = {
    id: 'ws-1',
    name: 'Workspace 1',
    path: '/repo-1',
    open: true,
    container: true,
    references: [],
    mounts: [],
    roots: [],
  };

  return {
    handlers,
    createdWorkspace,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    workspaceManager: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => createdWorkspace),
      remove: vi.fn(async () => {}),
      getConfig: vi.fn(async () => null),
      addFolder: vi.fn(async () => createdWorkspace),
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      setExpanded: vi.fn(async () => {}),
      inferWorkspace: vi.fn(async () => 'global'),
      setContainerEnabled: vi.fn(async () => {}),
      addReference: vi.fn(async () => {}),
      removeReference: vi.fn(async () => {}),
      addMount: vi.fn(async () => {}),
      removeMount: vi.fn(async () => {}),
      getRoots: vi.fn(async () => []),
      addRoot: vi.fn(async () => ({ id: 'root-1', name: 'Root 1', path: '/repo-1', kind: 'folder' })),
      removeRoot: vi.fn(async () => {}),
      renameRoot: vi.fn(async () => {}),
    },
    createWorkspaceRuntimeFacade: vi.fn(),
    assertIsSeroPluginFolder: vi.fn(async () => {}),
    recreateContainerIfRunning: vi.fn(async () => {}),
    appRuntimeReconcile: vi.fn(async () => {}),
    broadcastToWindows: vi.fn(),
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/features/workspace/runtime/runtime-facade', () => ({
  createWorkspaceRuntimeFacade: mocks.createWorkspaceRuntimeFacade,
}));

vi.mock('@electron/features/workspace/plugin-validation', () => ({
  assertIsSeroPluginFolder: mocks.assertIsSeroPluginFolder,
}));

vi.mock('@electron/features/workspace/container-sync', () => ({
  recreateContainerIfRunning: mocks.recreateContainerIfRunning,
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  appRuntimeManager: {
    reconcile: mocks.appRuntimeReconcile,
  },
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
}));

describe('workspace IPC runtime reconcile', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.workspaceManager.list.mockClear();
    mocks.workspaceManager.create.mockClear();
    mocks.workspaceManager.remove.mockClear();
    mocks.workspaceManager.getConfig.mockClear();
    mocks.workspaceManager.addFolder.mockClear();
    mocks.workspaceManager.open.mockClear();
    mocks.workspaceManager.close.mockClear();
    mocks.workspaceManager.setExpanded.mockClear();
    mocks.workspaceManager.inferWorkspace.mockClear();
    mocks.workspaceManager.setContainerEnabled.mockClear();
    mocks.workspaceManager.addReference.mockClear();
    mocks.workspaceManager.removeReference.mockClear();
    mocks.workspaceManager.addMount.mockClear();
    mocks.workspaceManager.removeMount.mockClear();
    mocks.workspaceManager.getRoots.mockClear();
    mocks.workspaceManager.addRoot.mockClear();
    mocks.workspaceManager.removeRoot.mockClear();
    mocks.workspaceManager.renameRoot.mockClear();
    mocks.createWorkspaceRuntimeFacade.mockReset();
    mocks.createWorkspaceRuntimeFacade.mockImplementation(async (workspaceId: string) => ({
      workspaceId,
      workspacePath: `/repo-${workspaceId}`,
      providerId: 'host',
      actualRuntime: 'host',
      capabilities: {
        exec: true,
        interactiveTerminal: true,
        directFileRead: true,
        directFileWrite: true,
        managedDevServers: false,
        browserAutomation: false,
        portDiscovery: false,
      },
      resolution: {
        workspaceId,
        workspacePath: `/repo-${workspaceId}`,
        desiredRuntime: 'host',
        actualRuntime: 'host',
        containerEnabled: false,
        capabilityAudit: [],
      },
      health: vi.fn(async () => ({ providerId: 'host', status: 'ready' })),
      exec: vi.fn(),
      createTerminal: vi.fn(),
    }));
    mocks.assertIsSeroPluginFolder.mockClear();
    mocks.recreateContainerIfRunning.mockClear();
    mocks.appRuntimeReconcile.mockClear();
    mocks.broadcastToWindows.mockClear();
  });

  it('reconciles app runtimes after workspace create/add/remove/close', async () => {
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');

    registerWorkspaceHandlers();

    const createHandler = mocks.handlers.get(IpcChannels.workspace.create) as
      | ((event: unknown, name: string, parentPath?: string) => Promise<WorkspaceInfo>)
      | undefined;
    const addFolderHandler = mocks.handlers.get(IpcChannels.workspace.addFolder) as
      | ((event: unknown, folderPath: string, name?: string) => Promise<WorkspaceInfo>)
      | undefined;
    const removeHandler = mocks.handlers.get(IpcChannels.workspace.remove) as
      | ((event: unknown, id: string) => Promise<void>)
      | undefined;
    const closeHandler = mocks.handlers.get(IpcChannels.workspace.close) as
      | ((event: unknown, id: string) => Promise<void>)
      | undefined;

    expect(createHandler).toBeTypeOf('function');
    expect(addFolderHandler).toBeTypeOf('function');
    expect(removeHandler).toBeTypeOf('function');
    expect(closeHandler).toBeTypeOf('function');

    await createHandler?.({}, 'Workspace 1', '/parent');
    await addFolderHandler?.({}, '/repo-1', 'Workspace 1');
    await removeHandler?.({}, 'ws-1');
    await closeHandler?.({}, 'ws-1');

    expect(mocks.workspaceManager.create).toHaveBeenCalledWith('Workspace 1', '/parent');
    expect(mocks.workspaceManager.addFolder).toHaveBeenCalledWith('/repo-1', 'Workspace 1');
    expect(mocks.workspaceManager.remove).toHaveBeenCalledWith('ws-1');
    expect(mocks.workspaceManager.close).toHaveBeenCalledWith('ws-1');
    expect(mocks.appRuntimeReconcile).toHaveBeenCalledTimes(4);
    expect(mocks.broadcastToWindows).toHaveBeenCalledTimes(4);
    expect(mocks.broadcastToWindows).toHaveBeenCalledWith(IpcChannels.workspace.changed);
  });

  it('returns additive runtime diagnostics metadata without changing existing fields', async () => {
    const runtimeHealth = { providerId: 'apple-container' as const, status: 'ready' as const };
    mocks.createWorkspaceRuntimeFacade.mockResolvedValueOnce({
      workspaceId: 'ws-1',
      workspacePath: '/repo-1',
      providerId: 'apple-container',
      actualRuntime: 'container',
      capabilities: {
        exec: true,
        interactiveTerminal: true,
        directFileRead: false,
        directFileWrite: false,
        managedDevServers: true,
        browserAutomation: true,
        portDiscovery: true,
      },
      resolution: {
        workspaceId: 'ws-1',
        workspacePath: '/repo-1',
        desiredRuntime: 'container',
        actualRuntime: 'container',
        containerEnabled: true,
        capabilityAudit: [{
          key: 'managedDevServers',
          label: 'Managed dev servers',
          available: true,
          containerOnly: true,
          detail: 'Available in container mode.',
        }],
      },
      health: vi.fn(async () => runtimeHealth),
      exec: vi.fn(),
      createTerminal: vi.fn(),
    });
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');

    registerWorkspaceHandlers();

    const diagnosticsHandler = mocks.handlers.get(IpcChannels.workspace.runtimeDiagnostics) as
      | ((event: unknown, workspaceId?: string) => Promise<unknown[]>)
      | undefined;

    expect(diagnosticsHandler).toBeTypeOf('function');

    const diagnostics = await diagnosticsHandler?.({}, 'ws-1');

    expect(mocks.createWorkspaceRuntimeFacade).toHaveBeenCalledWith('ws-1');
    expect(diagnostics).toEqual([{
      workspaceId: 'ws-1',
      workspacePath: '/repo-1',
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled: true,
      capabilityAudit: [{
        key: 'managedDevServers',
        label: 'Managed dev servers',
        available: true,
        containerOnly: true,
        detail: 'Available in container mode.',
      }],
      providerId: 'apple-container',
      runtimeHealth,
    }]);
  });

  it('marks runtime health as fallback while preserving fallback diagnostics fields', async () => {
    mocks.createWorkspaceRuntimeFacade.mockResolvedValueOnce({
      workspaceId: 'ws-1',
      workspacePath: '/repo-1',
      providerId: 'host',
      actualRuntime: 'host',
      fallbackReason: 'Container unavailable; falling back to host mode.',
      capabilities: {
        exec: true,
        interactiveTerminal: true,
        directFileRead: true,
        directFileWrite: true,
        managedDevServers: false,
        browserAutomation: false,
        portDiscovery: false,
      },
      resolution: {
        workspaceId: 'ws-1',
        workspacePath: '/repo-1',
        desiredRuntime: 'container',
        actualRuntime: 'host',
        containerEnabled: true,
        fallbackCode: 'container_unavailable',
        fallbackReason: 'Container unavailable; falling back to host mode.',
        capabilityAudit: [],
      },
      health: vi.fn(async () => ({ providerId: 'host', status: 'ready' })),
      exec: vi.fn(),
      createTerminal: vi.fn(),
    });
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');

    registerWorkspaceHandlers();

    const diagnosticsHandler = mocks.handlers.get(IpcChannels.workspace.runtimeDiagnostics) as
      | ((event: unknown, workspaceId?: string) => Promise<unknown[]>)
      | undefined;
    const diagnostics = await diagnosticsHandler?.({}, 'ws-1');

    expect(diagnostics?.[0]).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      containerEnabled: true,
      fallbackCode: 'container_unavailable',
      fallbackReason: 'Container unavailable; falling back to host mode.',
      providerId: 'host',
      runtimeHealth: {
        providerId: 'host',
        status: 'fallback',
        message: 'Container unavailable; falling back to host mode.',
      },
    });
  });

  it('does not reconcile app runtimes for non-lifecycle workspace mutations', async () => {
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');

    registerWorkspaceHandlers();

    const setExpandedHandler = mocks.handlers.get(IpcChannels.workspace.setExpanded) as
      | ((event: unknown, id: string, expanded: boolean) => Promise<void>)
      | undefined;
    const addReferenceHandler = mocks.handlers.get(IpcChannels.workspace.addReference) as
      | ((event: unknown, id: string, refId: string) => Promise<void>)
      | undefined;
    const addMountHandler = mocks.handlers.get(IpcChannels.workspace.addMount) as
      | ((event: unknown, id: string, folderPath: string) => Promise<void>)
      | undefined;

    expect(setExpandedHandler).toBeTypeOf('function');
    expect(addReferenceHandler).toBeTypeOf('function');
    expect(addMountHandler).toBeTypeOf('function');

    await setExpandedHandler?.({}, 'ws-1', true);
    await addReferenceHandler?.({}, 'ws-1', 'ws-2');
    await addMountHandler?.({}, 'ws-1', '/tmp/shared');

    expect(mocks.appRuntimeReconcile).not.toHaveBeenCalled();
    expect(mocks.recreateContainerIfRunning).toHaveBeenCalledTimes(2);
  });
});
