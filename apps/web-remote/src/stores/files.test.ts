import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { useFileStore, ROOT_DIR_PATH } from '@/stores/files';

const listFiles = vi.fn((_workspaceId: string, _path: string) => {});

function changedEvent(directories: unknown) {
  return { type: 'file_tree_changed', workspaceId: 'ws-1', directories } as never;
}

describe('file store — live changes', () => {
  beforeEach(() => {
    listFiles.mockClear();
    useConnectionStore.setState({ client: { listFiles } as unknown as never });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1' });
    useFileStore.getState().resetTree();
    useFileStore.setState({
      tree: {
        [ROOT_DIR_PATH]: [{ name: 'src', type: 'directory', path: '/workspace/src' }],
        '/workspace/src': [],
      },
    });
  });

  it('re-lists a changed folder the tree already shows', () => {
    useFileStore.getState().handleMessage(changedEvent(['/workspace/src']));

    expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace/src');
  });

  it('re-lists the root when the workspace directory itself changes', () => {
    useFileStore.getState().handleMessage(changedEvent(['/workspace']));

    expect(listFiles).toHaveBeenCalledWith('ws-1', ROOT_DIR_PATH);
  });

  it('leaves a folder the tree never listed alone', () => {
    useFileStore.getState().handleMessage(changedEvent(['/workspace/docs']));

    expect(listFiles).not.toHaveBeenCalled();
  });

  it('asks once for a folder named twice in one event', () => {
    useFileStore.getState().handleMessage(
      changedEvent(['/workspace/src', '/workspace/src']),
    );

    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the tree is unloaded', () => {
    useFileStore.getState().resetTree();

    useFileStore.getState().handleMessage(changedEvent(['/workspace/src']));

    expect(listFiles).not.toHaveBeenCalled();
  });

  it('re-lists the root on any change while the root is empty', () => {
    useFileStore.setState({ tree: { [ROOT_DIR_PATH]: [] } });

    useFileStore.getState().handleMessage(changedEvent(['/workspace']));

    expect(listFiles).toHaveBeenCalledWith('ws-1', ROOT_DIR_PATH);
  });

  it('ignores an event whose directories are not strings', () => {
    useFileStore.getState().handleMessage(changedEvent('/workspace/src'));

    expect(listFiles).not.toHaveBeenCalled();
  });
});
