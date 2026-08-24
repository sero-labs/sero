import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => {
  const state = {
    fileChangeListener: null as ((filePath: string, data: unknown) => void) | null,
    ipcHandle: vi.fn(),
    settingsReload: vi.fn(),
    reloadAllSessionResources: vi.fn().mockResolvedValue(undefined),
    ensureInfra: vi.fn(),
    appRuntimeHandleStateChange: vi.fn().mockResolvedValue(undefined),
    applyRuntimeSettings: vi.fn(),
    gitWatchStateFile: vi.fn(),
    appStateManager: {
      onFileChange: vi.fn((listener: (filePath: string, data: unknown) => void) => {
        state.fileChangeListener = listener;
      }),
      watch: vi.fn(),
      read: vi.fn(),
      readText: vi.fn(),
      remove: vi.fn(),
      write: vi.fn().mockResolvedValue({ ok: true, etag: 'etag' }),
    },
  };

  state.ensureInfra.mockResolvedValue({
    settingsManager: {
      reload: state.settingsReload,
    },
  });

  return state;
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
}));

vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: mocks.appStateManager,
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  SERO_CONFIG_PATH: '/tmp/sero-settings.json',
  ensureInfra: mocks.ensureInfra,
  applyRuntimeSettings: mocks.applyRuntimeSettings,
  appRuntimeManager: {
    handleStateChange: mocks.appRuntimeHandleStateChange,
  },
}));

vi.mock('@electron/ipc/agent/core/agent', () => ({
  reloadAllSessionResources: mocks.reloadAllSessionResources,
}));

vi.mock('@electron/features/apps/git-app/manager', () => ({
  gitWorkspaceStateManager: {
    isGitStateFile: () => false,
    watchStateFile: mocks.gitWatchStateFile,
  },
}));

describe('app-state settings reload coalescing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.fileChangeListener = null;
    mocks.ipcHandle.mockClear();
    mocks.settingsReload.mockClear();
    mocks.reloadAllSessionResources.mockClear();
    mocks.ensureInfra.mockClear();
    mocks.applyRuntimeSettings.mockClear();
    mocks.appRuntimeHandleStateChange.mockClear();
    mocks.gitWatchStateFile.mockClear();
    mocks.appStateManager.onFileChange.mockClear();
    mocks.appStateManager.watch.mockClear();
    mocks.appStateManager.read.mockClear();
    mocks.appStateManager.readText.mockClear();
    mocks.appStateManager.remove.mockClear();
    mocks.appStateManager.write.mockClear();
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('watches settings.json and reloads session resources after the coalescing window', async () => {
    const { registerAppStateHandlers } = await import('@electron/ipc/apps/app-state');

    registerAppStateHandlers();

    expect(mocks.appStateManager.watch).toHaveBeenCalledWith('/tmp/sero-settings.json');
    expect(mocks.fileChangeListener).toBeTypeOf('function');

    mocks.fileChangeListener?.('/tmp/sero-settings.json', { packages: ['/tmp/todo'] });

    expect(mocks.ensureInfra).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(80);

    expect(mocks.appRuntimeHandleStateChange).toHaveBeenCalledWith('/tmp/sero-settings.json', { packages: ['/tmp/todo'] });
    expect(mocks.ensureInfra).toHaveBeenCalledOnce();
    expect(mocks.settingsReload).toHaveBeenCalledOnce();
    expect(mocks.applyRuntimeSettings).toHaveBeenCalledOnce();
    expect(mocks.reloadAllSessionResources).toHaveBeenCalledOnce();
  });

  it('coalesces duplicate write-path and watcher notifications into one reload', async () => {
    const { registerAppStateHandlers } = await import('@electron/ipc/apps/app-state');

    registerAppStateHandlers();

    const writeHandler = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === IpcChannels.appState.write,
    )?.[1] as ((event: unknown, filePath: string, data: unknown) => Promise<void>) | undefined;

    expect(writeHandler).toBeTypeOf('function');

    const writePromise = writeHandler?.({}, '/tmp/sero-settings.json', { packages: ['/tmp/todo'] });
    mocks.fileChangeListener?.('/tmp/sero-settings.json', { packages: ['/tmp/todo'] });

    await vi.advanceTimersByTimeAsync(80);
    await writePromise;

    expect(mocks.appRuntimeHandleStateChange).toHaveBeenCalledTimes(2);
    expect(mocks.appRuntimeHandleStateChange).toHaveBeenNthCalledWith(1, '/tmp/sero-settings.json', { packages: ['/tmp/todo'] });
    expect(mocks.appRuntimeHandleStateChange).toHaveBeenNthCalledWith(2, '/tmp/sero-settings.json', { packages: ['/tmp/todo'] });
    expect(mocks.ensureInfra).toHaveBeenCalledOnce();
    expect(mocks.settingsReload).toHaveBeenCalledOnce();
    expect(mocks.applyRuntimeSettings).toHaveBeenCalledOnce();
    expect(mocks.reloadAllSessionResources).toHaveBeenCalledOnce();
  });

  it('ignores unrelated file changes', async () => {
    const { registerAppStateHandlers } = await import('@electron/ipc/apps/app-state');

    registerAppStateHandlers();
    mocks.fileChangeListener?.('/tmp/not-settings.json', { changed: true });

    await vi.runOnlyPendingTimersAsync();

    expect(mocks.appRuntimeHandleStateChange).toHaveBeenCalledWith('/tmp/not-settings.json', { changed: true });
    expect(mocks.ensureInfra).not.toHaveBeenCalled();
    expect(mocks.settingsReload).not.toHaveBeenCalled();
    expect(mocks.applyRuntimeSettings).not.toHaveBeenCalled();
    expect(mocks.reloadAllSessionResources).not.toHaveBeenCalled();
  });
});
