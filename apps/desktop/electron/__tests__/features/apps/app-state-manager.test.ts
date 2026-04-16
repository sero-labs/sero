import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const watcherInstances: Array<{ close: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }> = [];
  const createWatcher = () => {
    const watcher = {
      close: vi.fn(),
      on: vi.fn(),
    };
    watcherInstances.push(watcher);
    return watcher;
  };

  return {
    watcherInstances,
    createWatcher,
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    watch: vi.fn(() => createWatcher()),
    send: vi.fn(),
  };
});

vi.mock('fs', () => ({
  promises: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    rename: mocks.rename,
    unlink: mocks.unlink,
  },
  watch: mocks.watch,
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: mocks.send } }],
  },
}));

function alreadyExistsError(): NodeJS.ErrnoException {
  const error = new Error('already exists') as NodeJS.ErrnoException;
  error.code = 'EEXIST';
  return error;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AppStateManager watch bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.watcherInstances.length = 0;
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockRejectedValue(alreadyExistsError());
    mocks.readFile.mockResolvedValue('{}');
    mocks.rename.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.watch.mockImplementation(() => mocks.createWatcher());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('coalesces concurrent watch bootstrap and cancels cleanly before fs.watch starts', async () => {
    let resolveMkdir: (() => void) | undefined;
    const mkdirPromise = new Promise<void>((resolve) => {
      resolveMkdir = resolve;
    });
    mocks.mkdir.mockReturnValueOnce(mkdirPromise);

    const { AppStateManager } = await import('@electron/features/apps/state/manager');
    const manager = new AppStateManager();
    const filePath = '/tmp/sero-app-state.json';

    manager.watch(filePath);
    manager.watch(filePath);
    manager.unwatch(filePath);
    manager.unwatch(filePath);

    expect(mocks.mkdir).toHaveBeenCalledOnce();
    expect(mocks.watch).not.toHaveBeenCalled();

    resolveMkdir?.();
    await mkdirPromise;
    await flushPromises();

    expect(mocks.watch).not.toHaveBeenCalled();

    manager.dispose();
  });

  it('drops failed bootstrap entries so a later watch can retry', async () => {
    mocks.watch
      .mockImplementationOnce(() => {
        throw new Error('fs.watch failed');
      })
      .mockImplementation(() => mocks.createWatcher());

    const { AppStateManager } = await import('@electron/features/apps/state/manager');
    const manager = new AppStateManager();
    const filePath = '/tmp/sero-retry-state.json';

    manager.watch(filePath);
    await flushPromises();

    expect(mocks.watch).toHaveBeenCalledTimes(1);

    manager.watch(filePath);
    await flushPromises();

    expect(mocks.watch).toHaveBeenCalledTimes(2);
    expect(mocks.watcherInstances).toHaveLength(1);

    manager.dispose();
    expect(mocks.watcherInstances[0]?.close).toHaveBeenCalledOnce();
  });
});
