import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { useFileStore, ROOT_DIR_PATH } from '@/stores/files';
import { startFileTreeSync } from '@/stores/file-tree-sync';

const watchFileTree = vi.fn((_workspaceId: string) => {});
const unwatchFileTree = vi.fn((_workspaceId: string) => {});
const listFiles = vi.fn((_workspaceId: string, _path: string) => {});

/** The tree as it looks after the root listed one folder. */
function loadedTree() {
  return {
    [ROOT_DIR_PATH]: [{ name: 'src', type: 'directory' as const, path: '/workspace/src' }],
    '/workspace/src': [],
  };
}

describe('file tree sync', () => {
  let stop: () => void;

  beforeEach(() => {
    watchFileTree.mockClear();
    unwatchFileTree.mockClear();
    listFiles.mockClear();
    useConnectionStore.setState({
      state: 'disconnected',
      client: { watchFileTree, unwatchFileTree, listFiles } as unknown as never,
    });
    useWorkspaceStore.setState({ activeWorkspaceId: null, activeSessionId: null });
    useFileStore.getState().resetTree();
    stop?.();
    stop = startFileTreeSync();
  });

  it('loads and watches the tree when a session opens in a workspace', () => {
    useConnectionStore.setState({ state: 'connected' });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1', activeSessionId: 'session-1' });

    expect(watchFileTree).toHaveBeenCalledWith('ws-1');
    expect(listFiles).toHaveBeenCalledWith('ws-1', ROOT_DIR_PATH);
  });

  it('waits for a session, because the tree stays cold without one', () => {
    useConnectionStore.setState({ state: 'connected' });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1', activeSessionId: null });

    expect(watchFileTree).not.toHaveBeenCalled();
    expect(listFiles).not.toHaveBeenCalled();
  });

  it('empties the tree when the workspace changes, so nothing stale is shown', () => {
    useConnectionStore.setState({ state: 'connected' });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1', activeSessionId: 'session-1' });
    useFileStore.setState({ tree: loadedTree() });

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-2', activeSessionId: 'session-2' });

    expect(unwatchFileTree).toHaveBeenCalledWith('ws-1');
    expect(watchFileTree).toHaveBeenLastCalledWith('ws-2');
    expect(useFileStore.getState().tree).toEqual({});
  });

  it('watches again after a reconnect', () => {
    useConnectionStore.setState({ state: 'connected' });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1', activeSessionId: 'session-1' });
    watchFileTree.mockClear();
    listFiles.mockClear();

    useConnectionStore.setState({ state: 'reconnecting' });
    useConnectionStore.setState({ state: 'connected' });

    expect(watchFileTree).toHaveBeenCalledWith('ws-1');
    expect(listFiles).toHaveBeenCalledWith('ws-1', ROOT_DIR_PATH);
  });

  it('keeps the tree across a reconnect, because the workspace did not change', () => {
    useConnectionStore.setState({ state: 'connected' });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1', activeSessionId: 'session-1' });
    useFileStore.setState({ tree: loadedTree() });

    useConnectionStore.setState({ state: 'reconnecting' });

    expect(useFileStore.getState().tree).toEqual(loadedTree());
  });

  it('stops watching when the sync stops', () => {
    useConnectionStore.setState({ state: 'connected' });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1', activeSessionId: 'session-1' });

    stop();

    expect(unwatchFileTree).toHaveBeenCalledWith('ws-1');
  });
});
