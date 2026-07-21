import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const watcherRecords: Array<{
    targetPath: string;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }> = [];

  const createWatcher = (targetPath: string) => {
    const watcher = {
      close: vi.fn(),
      on: vi.fn(),
    };
    watcherRecords.push({
      targetPath,
      close: watcher.close,
      on: watcher.on,
    });
    return watcher;
  };

  return {
    watcherRecords,
    createWatcher,
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    readFileSync: vi.fn(() => ''),
    watch: vi.fn((targetPath: string) => createWatcher(targetPath)),
    refreshGitState: vi.fn().mockResolvedValue({ repoName: 'repo' }),
    runGitAction: vi.fn(),
    appStateWrite: vi.fn().mockResolvedValue(undefined),
    resolveStatePath: vi.fn((workspacePath: string) => `${workspacePath}/.sero/apps/git/state.json`),
    workspaceFindByPath: vi.fn((workspacePath: string) => (
      workspacePath === '/repo' ? { id: 'ws-1', path: '/repo' } : undefined
    )),
    workspaceGetPath: vi.fn((workspaceId: string) => (
      workspaceId === 'ws-1' ? '/repo' : undefined
    )),
  };
});

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  statSync: mocks.statSync,
  readFileSync: mocks.readFileSync,
  watch: mocks.watch,
}));

vi.mock('@electron/features/vcs/git-service/git-service', () => ({
  refreshGitState: mocks.refreshGitState,
  runGitAction: mocks.runGitAction,
}));

vi.mock('@electron/features/vcs/git-service/state-io', () => ({
  resolveStatePath: mocks.resolveStatePath,
}));

vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: {
    write: mocks.appStateWrite,
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: {
    findByPath: mocks.workspaceFindByPath,
    getPath: mocks.workspaceGetPath,
  },
}));

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('GitWorkspaceStateManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.watcherRecords.length = 0;
    mocks.existsSync.mockReset();
    mocks.existsSync.mockReturnValue(true);
    mocks.watch.mockReset();
    mocks.watch.mockImplementation((targetPath: string) => mocks.createWatcher(targetPath));
    mocks.refreshGitState.mockReset();
    mocks.refreshGitState.mockResolvedValue({ repoName: 'repo' });
    mocks.runGitAction.mockReset();
    mocks.appStateWrite.mockClear();
    mocks.resolveStatePath.mockClear();
    mocks.workspaceFindByPath.mockClear();
    mocks.workspaceGetPath.mockClear();
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('coalesces repeated invalidations into a single refresh pass', async () => {
    const { GitWorkspaceStateManager } = await import('@electron/features/apps/git-app/manager');
    const manager = new GitWorkspaceStateManager();
    const stateFilePath = '/repo/.sero/apps/git/state.json';

    manager.watchStateFile(stateFilePath);
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();

    expect(mocks.refreshGitState).toHaveBeenCalledTimes(1);
    expect(mocks.refreshGitState).toHaveBeenLastCalledWith('/repo', stateFilePath, {
      syncMode: 'watch',
      scope: 'auto',
    });

    mocks.refreshGitState.mockClear();

    manager.invalidateWorkspace('ws-1', 'editor:write-file');
    manager.invalidateWorkspace('ws-1', 'vcs:checkpoint-created');
    manager.invalidateWorkspace('ws-1', 'agent:mutating-turn');

    await vi.advanceTimersByTimeAsync(199);
    expect(mocks.refreshGitState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(mocks.refreshGitState).toHaveBeenCalledTimes(1);
    expect(mocks.refreshGitState).toHaveBeenLastCalledWith('/repo', stateFilePath, {
      syncMode: 'watch',
      scope: 'auto',
    });

    manager.unwatchStateFile(stateFilePath);
  });

  it('falls back to manual mode when live watch setup fails and never starts polling', async () => {
    mocks.watch
      .mockImplementationOnce(() => {
        throw new Error('recursive watch unavailable');
      })
      .mockImplementation((targetPath: string) => mocks.createWatcher(targetPath));

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { GitWorkspaceStateManager } = await import('@electron/features/apps/git-app/manager');
    const manager = new GitWorkspaceStateManager();
    const stateFilePath = '/repo/.sero/apps/git/state.json';

    manager.watchStateFile(stateFilePath);
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();

    expect(mocks.refreshGitState).toHaveBeenCalledTimes(1);
    expect(mocks.refreshGitState).toHaveBeenLastCalledWith('/repo', stateFilePath, {
      syncMode: 'manual',
      scope: 'auto',
    });
    expect(setIntervalSpy).not.toHaveBeenCalled();

    manager.unwatchStateFile(stateFilePath);
    setIntervalSpy.mockRestore();
  });
});
