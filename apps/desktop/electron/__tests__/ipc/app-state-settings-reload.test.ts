import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    fileChangeListener: null as ((filePath: string, data: unknown) => void) | null,
    ipcHandle: vi.fn(),
    settingsReload: vi.fn(),
    reloadAllSessionResources: vi.fn().mockResolvedValue(undefined),
    ensureInfra: vi.fn(),
    applyRuntimeSettings: vi.fn(),
    kanbanOnStateChange: vi.fn(),
    kanbanWatchWorkspace: vi.fn(),
    workspaceFindByPath: vi.fn(),
    gitWatchStateFile: vi.fn(),
    appStateManager: {
      onFileChange: vi.fn((listener: (filePath: string, data: unknown) => void) => {
        state.fileChangeListener = listener;
      }),
      watch: vi.fn(),
      read: vi.fn(),
      readText: vi.fn(),
      remove: vi.fn(),
      write: vi.fn(),
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

vi.mock('../../features/apps/state/manager', () => ({
  appStateManager: mocks.appStateManager,
}));

vi.mock('../../shared/infra/shared-infra', () => ({
  SERO_CONFIG_PATH: '/tmp/sero-settings.json',
  ensureInfra: mocks.ensureInfra,
  applyRuntimeSettings: mocks.applyRuntimeSettings,
  kanbanOrchestrator: {
    onStateChange: mocks.kanbanOnStateChange,
    watchWorkspace: mocks.kanbanWatchWorkspace,
  },
  workspaceManager: {
    findByPath: mocks.workspaceFindByPath,
  },
}));

vi.mock('../../ipc/agent', () => ({
  reloadAllSessionResources: mocks.reloadAllSessionResources,
}));

vi.mock('../../features/apps/git-app/manager', () => ({
  gitWorkspaceStateManager: {
    isGitStateFile: () => false,
    watchStateFile: mocks.gitWatchStateFile,
  },
}));

describe('app-state settings reload', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fileChangeListener = null;
    mocks.ipcHandle.mockClear();
    mocks.settingsReload.mockClear();
    mocks.reloadAllSessionResources.mockClear();
    mocks.ensureInfra.mockClear();
    mocks.applyRuntimeSettings.mockClear();
    mocks.kanbanOnStateChange.mockClear();
    mocks.kanbanWatchWorkspace.mockClear();
    mocks.workspaceFindByPath.mockClear();
    mocks.gitWatchStateFile.mockClear();
    mocks.appStateManager.onFileChange.mockClear();
    mocks.appStateManager.watch.mockClear();
    mocks.appStateManager.read.mockClear();
    mocks.appStateManager.readText.mockClear();
    mocks.appStateManager.remove.mockClear();
    mocks.appStateManager.write.mockClear();
  });

  it('watches settings.json and reloads session resources when it changes on disk', async () => {
    const { registerAppStateHandlers } = await import('../../ipc/apps/app-state');

    registerAppStateHandlers();

    expect(mocks.appStateManager.watch).toHaveBeenCalledWith('/tmp/sero-settings.json');
    expect(mocks.fileChangeListener).toBeTypeOf('function');

    mocks.fileChangeListener?.('/tmp/sero-settings.json', { packages: ['/tmp/todo'] });
    await vi.waitFor(() => {
      expect(mocks.ensureInfra).toHaveBeenCalledOnce();
      expect(mocks.settingsReload).toHaveBeenCalledOnce();
      expect(mocks.applyRuntimeSettings).toHaveBeenCalledOnce();
      expect(mocks.reloadAllSessionResources).toHaveBeenCalledOnce();
    });
  });

  it('ignores unrelated file changes', async () => {
    const { registerAppStateHandlers } = await import('../../ipc/apps/app-state');

    registerAppStateHandlers();
    mocks.fileChangeListener?.('/tmp/not-settings.json', {});

    await Promise.resolve();

    expect(mocks.ensureInfra).not.toHaveBeenCalled();
    expect(mocks.settingsReload).not.toHaveBeenCalled();
    expect(mocks.applyRuntimeSettings).not.toHaveBeenCalled();
    expect(mocks.reloadAllSessionResources).not.toHaveBeenCalled();
  });
});
