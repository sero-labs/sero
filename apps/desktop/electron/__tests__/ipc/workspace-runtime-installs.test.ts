import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { BrowserPackProgressEvent, BrowserPackStatus } from '@electron/features/workspace/runtime/browser-pack/types';
import type { ToolResolution, ToolStatus, ToolchainProgressEvent } from '@electron/features/workspace/runtime/toolchains/types';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    broadcastToWindows: vi.fn(),
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
      getRuntimeConfig: vi.fn(),
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
    },
    appRuntimeReconcile: vi.fn(async () => {}),
    runtimeManager: { resetWorkspaceRuntime: vi.fn(async () => {}) },
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
}));

vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: mocks.workspaceManager }));
vi.mock('@electron/shared/infra/shared-infra', () => ({
  workspaceManager: mocks.workspaceManager,
  appRuntimeManager: { reconcile: mocks.appRuntimeReconcile },
  runtimeManager: mocks.runtimeManager,
}));
vi.mock('@electron/features/workspace/runtime-resolution', () => ({ resolveWorkspaceRuntime: vi.fn() }));
vi.mock('@electron/features/workspace/plugin-validation', () => ({ assertIsSeroPluginFolder: vi.fn() }));
vi.mock('@electron/features/workspace/container-sync', () => ({ recreateContainerIfRunning: vi.fn() }));
vi.mock('@electron/ipc/lib/window-broadcast', () => ({ broadcastToWindows: mocks.broadcastToWindows }));

const readyTool: ToolStatus = {
  tool: 'node',
  state: 'ready',
  source: 'system',
  path: '/usr/bin/node',
  version: '22.0.0',
};

const missingTool: ToolStatus = {
  tool: 'node',
  state: 'missing',
  error: { code: 'TOOL_REQUIRED', message: 'missing', retryable: true, installable: true },
};

describe('workspace runtime install IPC', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.broadcastToWindows.mockClear();
    const { setRuntimeInstallManagersForTest } = await import('@electron/features/workspace/runtime/install-actions');
    setRuntimeInstallManagersForTest({ toolchain: null, browserPack: null });
  });

  it('reports toolchain and browser pack status', async () => {
    await registerWithFakes({ toolStatus: readyTool, browserStatus: browserReady() });

    const toolchain = await invoke('sero:workspace:get-toolchain-status');
    expect(toolchain).toMatchObject({ state: 'ready' });

    const browser = await invoke('sero:workspace:get-browser-pack-status');
    expect(browser).toMatchObject({ state: 'ready', browsersPath: '/browser' });
  });

  it('ensures core tools successfully and broadcasts progress', async () => {
    const toolchain = createToolchainFake({ beforeStatus: missingTool, afterStatus: readyTool });
    await registerWithFakes({ toolchain, browserStatus: browserReady() });

    await expect(invoke('sero:workspace:ensure-core-tools', 'settings')).resolves.toMatchObject({ state: 'ready' });
    expect(toolchain.ensureCalls).toBe(1);
    expect(mocks.broadcastToWindows).toHaveBeenCalledWith(
      IpcChannels.workspace.toolchainProgress,
      expect.objectContaining({ phase: 'ready', tool: 'node' }),
    );
  });

  it('returns failed core tool status with retry detail when ensure fails', async () => {
    const toolchain = createToolchainFake({
      beforeStatus: missingTool,
      afterStatus: {
        tool: 'node',
        state: 'failed',
        error: { code: 'TOOL_INSTALL_FAILED', message: 'offline', retryable: true, installable: true },
      },
      failEnsure: true,
    });
    await registerWithFakes({ toolchain, browserStatus: browserReady() });

    await expect(invoke('sero:workspace:ensure-core-tools', 'settings')).resolves.toMatchObject({
      state: 'failed',
      error: { message: 'offline', retryable: true },
    });
  });

  it('dedupes concurrent core tool ensures through one in-flight operation', async () => {
    const gate = createDeferred<ToolResolution[]>();
    const toolchain = createToolchainFake({ beforeStatus: missingTool, afterStatus: readyTool, ensurePromise: gate.promise });
    await registerWithFakes({ toolchain, browserStatus: browserReady() });

    const first = invoke('sero:workspace:ensure-core-tools', 'settings');
    const second = invoke('sero:workspace:ensure-core-tools', 'settings');
    gate.resolve([{ tool: 'node', source: 'managed', path: '/managed/node' }]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ state: 'ready' }),
      expect.objectContaining({ state: 'ready' }),
    ]);
    expect(toolchain.ensureCalls).toBe(1);
  });

  it('ensures and uninstalls the browser pack', async () => {
    const browser = createBrowserFake({ beforeStatus: browserInstallable(), afterStatus: browserReady() });
    await registerWithFakes({ toolStatus: readyTool, browser });

    await expect(invoke('sero:workspace:ensure-browser-pack', 'settings')).resolves.toMatchObject({ state: 'ready' });
    await expect(invoke('sero:workspace:uninstall-browser-pack')).resolves.toMatchObject({ state: 'installable' });
    expect(browser.ensureCalls).toBe(1);
    expect(browser.uninstallCalls).toBe(1);
  });
});

async function registerWithFakes(input: {
  toolStatus?: ToolStatus;
  browserStatus?: BrowserPackStatus;
  toolchain?: ReturnType<typeof createToolchainFake>;
  browser?: ReturnType<typeof createBrowserFake>;
}): Promise<void> {
  const { setRuntimeInstallManagersForTest } = await import('@electron/features/workspace/runtime/install-actions');
  setRuntimeInstallManagersForTest({
    toolchain: input.toolchain ?? createToolchainFake({ beforeStatus: input.toolStatus ?? readyTool }),
    browserPack: input.browser ?? createBrowserFake({ beforeStatus: input.browserStatus ?? browserReady() }),
  });
  const { registerWorkspaceHandlers } = await import('@electron/ipc/workspace/workspace');
  registerWorkspaceHandlers();
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mocks.handlers.get(channel);
  expect(handler).toBeTypeOf('function');
  return handler?.({}, ...args);
}

function createToolchainFake(input: {
  beforeStatus: ToolStatus;
  afterStatus?: ToolStatus;
  failEnsure?: boolean;
  ensurePromise?: Promise<ToolResolution[]>;
}) {
  let installed = false;
  const listeners = new Set<(event: ToolchainProgressEvent) => void>();
  return {
    ensureCalls: 0,
    async status(): Promise<ToolStatus> {
      return installed ? input.afterStatus ?? input.beforeStatus : input.beforeStatus;
    },
    async ensureCore(): Promise<ToolResolution[]> {
      this.ensureCalls += 1;
      listeners.forEach((listener) => listener(progress('queued')));
      if (input.ensurePromise) await input.ensurePromise;
      if (input.failEnsure) {
        installed = true;
        listeners.forEach((listener) => listener(progress('failed')));
        throw new Error('offline');
      }
      installed = true;
      listeners.forEach((listener) => listener(progress('ready')));
      return [{ tool: 'node', source: 'managed', path: '/managed/node' }];
    },
    subscribe(listener: (event: ToolchainProgressEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createBrowserFake(input: { beforeStatus: BrowserPackStatus; afterStatus?: BrowserPackStatus }) {
  let installed = input.beforeStatus.state === 'ready';
  const listeners = new Set<(event: BrowserPackProgressEvent) => void>();
  return {
    ensureCalls: 0,
    uninstallCalls: 0,
    async status(): Promise<BrowserPackStatus> {
      return installed ? input.afterStatus ?? input.beforeStatus : input.beforeStatus;
    },
    async ensure(): Promise<BrowserPackStatus> {
      this.ensureCalls += 1;
      installed = true;
      listeners.forEach((listener) => listener({ phase: 'ready', manifestVersion: 'test', artifactKey: 'browser-test' }));
      return input.afterStatus ?? browserReady();
    },
    async uninstall(): Promise<BrowserPackStatus> {
      this.uninstallCalls += 1;
      installed = false;
      return browserInstallable();
    },
    subscribe(listener: (event: BrowserPackProgressEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function progress(phase: ToolchainProgressEvent['phase']): ToolchainProgressEvent {
  return { tool: 'node', artifactKey: 'node-test', manifestVersion: 'test', phase };
}

function browserReady(): BrowserPackStatus {
  return { state: 'ready', manifestVersion: 'test', artifactKey: 'browser-test', browsersPath: '/browser' };
}

function browserInstallable(): BrowserPackStatus {
  return {
    state: 'installable',
    manifestVersion: 'test',
    artifactKey: 'browser-test',
    error: { code: 'BROWSER_PACK_REQUIRED', message: 'install browser', retryable: true, installable: true },
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
