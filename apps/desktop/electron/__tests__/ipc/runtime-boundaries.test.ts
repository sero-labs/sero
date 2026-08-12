import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    workspaceManager: {
      getRuntimeConfig: vi.fn(async () => ({ backend: 'host' })),
      getPath: vi.fn(() => '/repo'),
      list: vi.fn(async () => [{ id: 'ws-1' }]),
      getConfig: vi.fn(async () => null),
      create: vi.fn(),
      remove: vi.fn(),
      addFolder: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      setExpanded: vi.fn(),
      inferWorkspace: vi.fn(),
      setRuntimeBackend: vi.fn(),
      setContainerEnabled: vi.fn(),
      addReference: vi.fn(),
      removeReference: vi.fn(),
      addMount: vi.fn(),
      removeMount: vi.fn(),
      getRoots: vi.fn(async () => []),
      addRoot: vi.fn(),
      removeRoot: vi.fn(),
      renameRoot: vi.fn(),
      findEntry: vi.fn(),
    },
    containerManager: {
      hasContainer: vi.fn(() => true),
      inspect: vi.fn(async () => ({ id: 'container-1', state: 'running' })),
      ensure: vi.fn(async () => ({ id: 'container-1', state: 'running' })),
    },
    buildContainerConfig: vi.fn(async () => ({ workspaceId: 'ws-1' })),
    runtimeManager: {
      getRuntime: vi.fn(),
      resetWorkspaceRuntime: vi.fn(async () => {}),
    },
    resolveWorkspaceRuntime: vi.fn(async (workspaceId: string) => ({
      workspaceId,
      workspacePath: '/repo',
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend: 'docker',
      actualBackend: 'docker',
      containerEnabled: true,
      fallbackCode: 'container_unavailable',
      fallbackReason: 'Container unavailable',
      capabilityAudit: [],
    })),
    appRuntimeReconcile: vi.fn(async () => {}),
    broadcastToWindows: vi.fn(),
    assertIsSeroPluginFolder: vi.fn(async () => {}),
    recreateContainerIfRunning: vi.fn(async () => {}),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  workspaceManager: mocks.workspaceManager,
  containerManager: mocks.containerManager,
  buildContainerConfig: mocks.buildContainerConfig,
  appRuntimeManager: { reconcile: mocks.appRuntimeReconcile },
  runtimeManager: mocks.runtimeManager,
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: mocks.runtimeManager,
}));

vi.mock('@electron/features/workspace/runtime-resolution', () => ({
  resolveWorkspaceRuntime: mocks.resolveWorkspaceRuntime,
}));

vi.mock('@electron/features/workspace/plugin-validation', () => ({
  assertIsSeroPluginFolder: mocks.assertIsSeroPluginFolder,
}));

vi.mock('@electron/features/workspace/container-sync', () => ({
  recreateContainerIfRunning: mocks.recreateContainerIfRunning,
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_FIXED_ROOT: '/tmp/sero-fixed-root',
}));

vi.mock('@electron/features/apps/git-app/manager', () => ({
  gitWorkspaceStateManager: { invalidateWorkspace: vi.fn() },
}));

describe('runtime-aware IPC boundaries', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.workspaceManager.getRuntimeConfig.mockReset().mockResolvedValue({ backend: 'host' });
    mocks.workspaceManager.getPath.mockReset().mockReturnValue('/repo');
    mocks.workspaceManager.list.mockReset().mockResolvedValue([{ id: 'ws-1' }]);
    mocks.containerManager.hasContainer.mockReset().mockReturnValue(true);
    mocks.containerManager.inspect.mockReset().mockResolvedValue({ id: 'container-1', state: 'running' });
    mocks.containerManager.ensure.mockReset().mockResolvedValue({ id: 'container-1', state: 'running' });
    mocks.buildContainerConfig.mockReset().mockResolvedValue({ workspaceId: 'ws-1' });
    mocks.runtimeManager.getRuntime.mockClear();
    mocks.runtimeManager.resetWorkspaceRuntime.mockClear();
    mocks.resolveWorkspaceRuntime.mockClear();
  });

  it('container ensure returns null for host and Docker, and ensures Apple Container only', async () => {
    const { registerContainerHandlers } = await import('@electron/ipc/container/container');
    registerContainerHandlers();

    const ensureHandler = mocks.handlers.get(IpcChannels.container.ensure) as
      | ((event: unknown, workspaceId: string) => Promise<unknown>)
      | undefined;
    expect(ensureHandler).toBeTypeOf('function');

    await expect(ensureHandler?.({}, 'ws-1')).resolves.toBeNull();
    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();

    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'docker' });
    await expect(ensureHandler?.({}, 'ws-1')).resolves.toBeNull();
    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();

    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'apple-container' });
    await expect(ensureHandler?.({}, 'ws-1')).resolves.toEqual({ id: 'container-1', state: 'running' });
    expect(mocks.buildContainerConfig).toHaveBeenCalledWith('ws-1', '/repo');
    expect(mocks.containerManager.ensure).toHaveBeenCalledTimes(1);
  });

  it('container inspect reports backend id when called for host runtime', async () => {
    const { registerContainerHandlers } = await import('@electron/ipc/container/container');
    registerContainerHandlers();

    const inspectHandler = mocks.handlers.get(IpcChannels.container.inspect) as
      | ((event: unknown, workspaceId: string) => Promise<unknown>)
      | undefined;
    expect(inspectHandler).toBeTypeOf('function');

    await expect(inspectHandler?.({}, 'ws-1')).rejects.toThrow(/runtime backend: host/);

    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'docker' });
    await expect(inspectHandler?.({}, 'ws-1')).rejects.toThrow(/runtime backend: docker/);
    expect(mocks.containerManager.inspect).not.toHaveBeenCalled();
  });

  it('editor compatibility isContainer channel derives from runtime backend', async () => {
    const { registerEditorHandlers } = await import('@electron/ipc/editor/editor');
    registerEditorHandlers();

    const isContainerHandler = mocks.handlers.get(IpcChannels.editor.isContainer) as
      | ((event: unknown, workspaceId: string) => Promise<boolean>)
      | undefined;
    expect(isContainerHandler).toBeTypeOf('function');

    await expect(isContainerHandler?.({}, 'ws-1')).resolves.toBe(false);
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'apple-container' });
    await expect(isContainerHandler?.({}, 'ws-1')).resolves.toBe(true);
  });

  it('workspace runtime diagnostics surface desired and actual backend ids', async () => {
    const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
    registerWorkspaceHandlers();

    const diagnosticsHandler = mocks.handlers.get(IpcChannels.workspace.runtimeDiagnostics) as
      | ((event: unknown, workspaceId?: string) => Promise<Array<{ desiredBackend: string; actualBackend: string }>>)
      | undefined;
    expect(diagnosticsHandler).toBeTypeOf('function');

    const diagnostics = await diagnosticsHandler?.({}, 'ws-1');
    expect(diagnostics).toEqual([
      expect.objectContaining({ desiredBackend: 'docker', actualBackend: 'docker' }),
    ]);
  });
});
