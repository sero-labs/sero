import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    watch: mocks.watch,
  },
}));

import { IpcChannels } from '@/types/ipc-channels';
import { FileWatcherManager } from '@electron/features/workspace/watcher';

interface WatchInvocation {
  hostDir: string;
  callback: (eventType: string, filename: string | Buffer | null) => void;
  close: ReturnType<typeof vi.fn>;
}

describe('FileWatcherManager', () => {
  const invocations: WatchInvocation[] = [];
  const send = vi.fn();
  const manager = new FileWatcherManager();

  beforeEach(() => {
    vi.useFakeTimers();
    invocations.length = 0;
    send.mockReset();
    mocks.existsSync.mockReset().mockReturnValue(true);
    mocks.mkdirSync.mockReset();
    mocks.watch.mockReset().mockImplementation((hostDir, _options, callback) => {
      const close = vi.fn();
      invocations.push({ hostDir, callback, close });
      return {
        close,
        on: vi.fn(),
      };
    });

    manager.setWindow({
      isDestroyed: () => false,
      webContents: { send },
    } as never);
  });

  afterEach(() => {
    manager.disposeAll();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('watches every workspace root and maps events into virtual directories', () => {
    manager.watch('ws-1', [
      { hostDir: '/Users/dan/workspaces/current', virtualRoot: '/workspace' },
      { hostDir: '/Users/dan/code/sero-plugin', virtualRoot: '/sero-plugin' },
    ]);

    expect(invocations.map((entry) => entry.hostDir)).toEqual([
      '/Users/dan/workspaces/current',
      '/Users/dan/code/sero-plugin',
    ]);

    invocations[0].callback('change', 'src/index.ts');
    invocations[1].callback('change', 'lib/main.ts');
    vi.advanceTimersByTime(151);

    expect(send).toHaveBeenCalledWith(IpcChannels.filetree.changed, {
      workspaceId: 'ws-1',
      directories: ['/workspace/src', '/sero-plugin/lib'],
    });
  });

  it('refreshes the watcher set when roots change', () => {
    manager.watch('ws-1', [
      { hostDir: '/Users/dan/workspaces/current', virtualRoot: '/workspace' },
    ]);
    const originalClose = invocations[0].close;

    manager.watch('ws-1', [
      { hostDir: '/Users/dan/workspaces/current', virtualRoot: '/workspace' },
      { hostDir: '/Users/dan/code/sero-plugin', virtualRoot: '/sero-plugin' },
    ]);

    expect(originalClose).toHaveBeenCalledTimes(1);
    expect(invocations.map((entry) => entry.hostDir)).toEqual([
      '/Users/dan/workspaces/current',
      '/Users/dan/workspaces/current',
      '/Users/dan/code/sero-plugin',
    ]);
  });

  it('keeps watching for the second owner when the first one leaves', () => {
    const roots = [{ hostDir: '/Users/dan/workspaces/current', virtualRoot: '/workspace' }];
    manager.watch('ws-1', roots, 'renderer');
    manager.watch('ws-1', roots, 'gateway');

    // One filesystem watch serves both owners.
    expect(invocations).toHaveLength(1);

    manager.unwatch('ws-1', 'renderer');
    expect(invocations[0].close).not.toHaveBeenCalled();

    invocations[0].callback('change', 'src/index.ts');
    vi.advanceTimersByTime(151);
    expect(send).toHaveBeenCalledWith(IpcChannels.filetree.changed, {
      workspaceId: 'ws-1',
      directories: ['/workspace/src'],
    });

    manager.unwatch('ws-1', 'gateway');
    expect(invocations[0].close).toHaveBeenCalledTimes(1);
  });

  it('tells a listener what changed, alongside the window', () => {
    const heard: unknown[] = [];
    const stop = manager.onChange((event) => heard.push(event));

    manager.watch('ws-1', [
      { hostDir: '/Users/dan/workspaces/current', virtualRoot: '/workspace' },
    ]);
    invocations[0].callback('change', 'src/index.ts');
    vi.advanceTimersByTime(151);

    expect(heard).toEqual([{ workspaceId: 'ws-1', directories: ['/workspace/src'] }]);

    stop();
    invocations[0].callback('change', 'lib/main.ts');
    vi.advanceTimersByTime(151);
    expect(heard).toHaveLength(1);
  });

  it('watches the workspace root when the host directory is missing but skips missing linked roots', () => {
    mocks.existsSync.mockImplementation(((target: string) => target === '/Users/dan/workspaces/current') as any);

    manager.watch('ws-1', [
      { hostDir: '/Users/dan/workspaces/current', virtualRoot: '/workspace' },
      { hostDir: '/Users/dan/code/missing-plugin', virtualRoot: '/missing-plugin' },
    ]);

    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(invocations.map((entry) => entry.hostDir)).toEqual(['/Users/dan/workspaces/current']);
  });
});
