import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { WorkspaceChangeEvent } from '@electron/features/workspace/watcher';

/** The listener the bridge installs, captured so a test can fire it. */
let fileChanged: ((event: WorkspaceChangeEvent) => void) | null = null;
const watch = vi.fn();
const unwatch = vi.fn();

vi.mock('@electron/features/workspace/watcher', () => ({
  fileWatcherManager: {
    watch: (workspaceId: string, roots: unknown, owner: string) => watch(workspaceId, roots, owner),
    unwatch: (workspaceId: string, owner: string) => unwatch(workspaceId, owner),
    onChange: (listener: (event: WorkspaceChangeEvent) => void) => {
      fileChanged = listener;
      return () => {
        fileChanged = null;
      };
    },
  },
}));

vi.mock('@electron/features/workspace/watch-roots', () => ({
  workspaceWatchRoots: async (workspaceId: string) =>
    workspaceId === 'ws-missing'
      ? null
      : [{ hostDir: '/work/one', virtualRoot: '/workspace' }],
}));

import {
  dropFileTreeWatches,
  resetFileTreeBridge,
  unwatchFileTree,
  watchFileTree,
} from '@electron/features/gateway/bridge/file-tree-bridge';

function fakeSocket(): { ws: WebSocket; sent: Array<Record<string, unknown>> } {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as Record<string, unknown>),
  } as unknown as WebSocket;
  return { ws, sent };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetFileTreeBridge();
  vi.useRealTimers();
  watch.mockClear();
  unwatch.mockClear();
});

describe('file tree bridge', () => {
  it('pushes a change to the socket that watched the workspace', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });

    expect(sent).toEqual([
      { type: 'file_tree_changed', workspaceId: 'ws-1', directories: ['/workspace/src'] },
    ]);
  });

  it('sends nothing to a socket that watched another workspace', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-2', directories: ['/workspace/src'] });

    expect(sent).toEqual([]);
  });

  it('drops a directory outside the primary root, which the tree cannot show', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/plugin-x/src'] });

    expect(sent).toEqual([]);
  });

  it('watches the filesystem once for two sockets, and stops on the last one', async () => {
    const first = fakeSocket();
    const second = fakeSocket();
    await watchFileTree(first.ws, 'ws-1');
    await watchFileTree(second.ws, 'ws-1');

    expect(watch).toHaveBeenCalledTimes(2);
    expect(watch).toHaveBeenLastCalledWith(
      'ws-1',
      [{ hostDir: '/work/one', virtualRoot: '/workspace' }],
      'gateway',
    );

    unwatchFileTree(first.ws, 'ws-1');
    expect(unwatch).not.toHaveBeenCalled();

    unwatchFileTree(second.ws, 'ws-1');
    expect(unwatch).toHaveBeenCalledWith('ws-1', 'gateway');
  });

  it('stops sending to a socket that went away', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    dropFileTreeWatches(ws);
    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });

    expect(sent).toEqual([]);
    expect(unwatch).toHaveBeenCalledWith('ws-1', 'gateway');
  });

  it('sends the first change at once, then holds the rest for a second', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });
    expect(sent).toHaveLength(1);

    // Everything inside the window travels together, once, and only once.
    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/docs'] });
    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/docs', '/workspace'] });
    vi.advanceTimersByTime(999);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      type: 'file_tree_changed',
      workspaceId: 'ws-1',
      directories: ['/workspace/docs', '/workspace'],
    });
  });

  it('sends nothing when the window closes on a quiet workspace', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });
    vi.advanceTimersByTime(5000);

    expect(sent).toHaveLength(1);
  });

  it('sends the next change at once after a quiet window', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });
    vi.advanceTimersByTime(1000);

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });
    expect(sent).toHaveLength(2);
  });

  it('holds nothing for a socket that went away mid-window', async () => {
    const { ws, sent } = fakeSocket();
    await watchFileTree(ws, 'ws-1');

    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });
    fileChanged?.({ workspaceId: 'ws-1', directories: ['/workspace/docs'] });
    dropFileTreeWatches(ws);
    vi.advanceTimersByTime(1000);

    expect(sent).toHaveLength(1);
  });

  it('refuses a workspace with no path on disk', async () => {
    const { ws } = fakeSocket();

    await expect(watchFileTree(ws, 'ws-missing')).resolves.toBe(false);
    expect(watch).not.toHaveBeenCalled();
  });
});
