import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { diffKey, selectFiles, useGitStore, type GitStatus } from '@/stores/git';
import type { GatewayMessage } from '@/lib/gateway-client';

/** A promise the test settles by hand, standing in for a slow host. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let settled promises run their handlers. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const gitStatus = vi.fn((_workspaceId: string): Promise<unknown> => Promise.resolve(status));
const gitDiff = vi.fn(
  (_workspaceId: string, path: string, staged: boolean): Promise<unknown> =>
    Promise.resolve({ path, staged, hunks: [] }),
);
const gitCommit = vi.fn(
  (_workspaceId: string, _message: string, _paths: string[]): Promise<unknown> =>
    Promise.resolve({ hash: 'abc1234', branch: 'main', fileCount: 1 }),
);

const status: GitStatus = {
  branch: 'main',
  ahead: 1,
  behind: 0,
  detached: false,
  merging: false,
  files: [
    { path: 'src/a.ts', status: 'modified', staged: false },
    { path: 'src/b.ts', status: 'added', staged: true },
  ],
};

function turnComplete(workspaceId: string): GatewayMessage {
  return {
    type: 'turn_complete',
    workspaceId,
    sessionId: 's1',
    ts: Date.now(),
    outcome: 'completed',
  } as unknown as GatewayMessage;
}

describe('git store', () => {
  beforeEach(() => {
    gitStatus.mockClear();
    gitDiff.mockClear();
    gitCommit.mockClear();
    gitStatus.mockImplementation(() => Promise.resolve(status));
    useConnectionStore.setState({
      client: { gitStatus, gitDiff, gitCommit } as unknown as never,
    });
    useGitStore.setState({
      workspaceId: null,
      status: null,
      loading: false,
      openPath: null,
      diffs: {},
      selectedPaths: [],
      committing: false,
      lastCommit: null,
      error: null,
    });
  });

  it('asks the gateway for the working tree', () => {
    useGitStore.getState().refresh('ws-1');

    expect(gitStatus).toHaveBeenCalledWith('ws-1');
    expect(useGitStore.getState().loading).toBe(true);
    expect(useGitStore.getState().workspaceId).toBe('ws-1');
  });

  it('stores the working tree it gets back', async () => {
    useGitStore.getState().refresh('ws-1');
    await flush();

    expect(useGitStore.getState().status?.branch).toBe('main');
    expect(useGitStore.getState().status?.files).toHaveLength(2);
    expect(useGitStore.getState().loading).toBe(false);
  });

  it('ignores a malformed status', async () => {
    gitStatus.mockResolvedValueOnce({ branch: 'main' });

    useGitStore.getState().refresh('ws-1');
    await flush();

    expect(useGitStore.getState().status).toBeNull();
  });

  it('shows why the tree could not be read', async () => {
    gitStatus.mockRejectedValueOnce(new Error('Workspace not found: ws-1'));

    useGitStore.getState().refresh('ws-1');
    await flush();

    expect(useGitStore.getState().error).toBe('Workspace not found: ws-1');
    expect(useGitStore.getState().loading).toBe(false);
  });

  it('drops the old diffs on a refresh, because the tree moved', async () => {
    useGitStore.setState({ workspaceId: 'ws-1', diffs: { 'working:src/a.ts': { path: 'src/a.ts' } as never } });

    useGitStore.getState().refresh('ws-1');
    await flush();

    expect(useGitStore.getState().diffs).toEqual({});
  });

  it('drops a selected path that is no longer changed', async () => {
    useGitStore.setState({ workspaceId: 'ws-1', selectedPaths: ['src/a.ts', 'gone.ts'] });

    useGitStore.getState().refresh('ws-1');
    await flush();

    expect(useGitStore.getState().selectedPaths).toEqual(['src/a.ts']);
  });

  it('clears another workspace\'s tree the moment the panel switches', () => {
    useGitStore.setState({ workspaceId: 'ws-a', status, selectedPaths: ['src/a.ts'], openPath: 'src/a.ts' });

    useGitStore.getState().refresh('ws-b');

    const state = useGitStore.getState();
    expect(state.workspaceId).toBe('ws-b');
    expect(state.status).toBeNull();
    expect(state.selectedPaths).toEqual([]);
    expect(state.openPath).toBeNull();
  });

  it('drops a status reply from a workspace it has moved on from', async () => {
    const slow = deferred<unknown>();
    gitStatus.mockReturnValueOnce(slow.promise);
    useGitStore.getState().refresh('ws-a');
    useGitStore.getState().refresh('ws-b');
    await flush();
    expect(useGitStore.getState().status?.branch).toBe('main');

    slow.resolve({ ...status, branch: 'from-a' });
    await flush();

    expect(useGitStore.getState().workspaceId).toBe('ws-b');
    expect(useGitStore.getState().status?.branch).toBe('main');
  });

  it('drops a status reply a newer refresh of the same workspace overtook', async () => {
    const slow = deferred<unknown>();
    gitStatus.mockReturnValueOnce(slow.promise);
    useGitStore.getState().refresh('ws-1');
    useGitStore.getState().refresh('ws-1');
    await flush();

    slow.resolve({ ...status, branch: 'stale' });
    await flush();

    expect(useGitStore.getState().status?.branch).toBe('main');
  });

  it('fetches a diff the first time a file is opened', () => {
    useGitStore.setState({ workspaceId: 'ws-1', status });

    useGitStore.getState().openFile('ws-1', { path: 'src/a.ts', status: 'modified', staged: false });

    expect(gitDiff).toHaveBeenCalledWith('ws-1', 'src/a.ts', false);
    expect(useGitStore.getState().openPath).toBe('src/a.ts');
  });

  it('does not fetch a diff it already holds', () => {
    useGitStore.setState({
      workspaceId: 'ws-1',
      diffs: { [diffKey('src/a.ts', false)]: { path: 'src/a.ts' } as never },
    });

    useGitStore.getState().openFile('ws-1', { path: 'src/a.ts', status: 'modified', staged: false });

    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('keeps the staged and working diffs of one file apart', async () => {
    useGitStore.setState({ workspaceId: 'ws-1', status });

    useGitStore.getState().openFile('ws-1', { path: 'src/a.ts', status: 'modified', staged: true });
    await flush();

    expect(Object.keys(useGitStore.getState().diffs)).toEqual(['staged:src/a.ts']);
  });

  it('drops a diff for a workspace it has moved on from', async () => {
    const slow = deferred<unknown>();
    gitDiff.mockReturnValueOnce(slow.promise);
    useGitStore.setState({ workspaceId: 'ws-a', status });
    useGitStore.getState().openFile('ws-a', { path: 'src/a.ts', status: 'modified', staged: false });
    useGitStore.getState().refresh('ws-b');

    slow.resolve({ path: 'src/a.ts', staged: false, hunks: [] });
    await flush();

    expect(useGitStore.getState().diffs).toEqual({});
  });

  it('drops a diff that a refresh of the same workspace overtook', async () => {
    const slow = deferred<unknown>();
    gitDiff.mockReturnValueOnce(slow.promise);
    useGitStore.setState({ workspaceId: 'ws-1', status });
    useGitStore.getState().openFile('ws-1', { path: 'src/a.ts', status: 'modified', staged: false });
    useGitStore.getState().refresh('ws-1');
    await flush();

    slow.resolve({ path: 'src/a.ts', staged: false, hunks: [] });
    await flush();

    expect(useGitStore.getState().diffs).toEqual({});
  });

  it('refetches the tree when a turn finishes in its workspace', () => {
    useGitStore.setState({ workspaceId: 'ws-1', status });

    useGitStore.getState().handleMessage(turnComplete('ws-1'));

    expect(gitStatus).toHaveBeenCalledWith('ws-1');
  });

  it('leaves the tree alone when a turn finishes in another workspace', () => {
    useGitStore.setState({ workspaceId: 'ws-1', status });

    useGitStore.getState().handleMessage(turnComplete('ws-2'));

    expect(gitStatus).not.toHaveBeenCalled();
    expect(useGitStore.getState().workspaceId).toBe('ws-1');
  });

  it('does not refetch before the panel was ever opened', () => {
    useGitStore.getState().handleMessage(turnComplete('ws-1'));

    expect(gitStatus).not.toHaveBeenCalled();
  });

  it('commits only the selected paths', () => {
    useGitStore.setState({ workspaceId: 'ws-1', status, selectedPaths: ['src/a.ts'] });

    useGitStore.getState().commit('ws-1', 'fix: a');

    expect(gitCommit).toHaveBeenCalledWith('ws-1', 'fix: a', ['src/a.ts']);
    expect(useGitStore.getState().committing).toBe(true);
  });

  it('sends nothing when no file is selected', () => {
    useGitStore.setState({ workspaceId: 'ws-1', status });

    useGitStore.getState().commit('ws-1', 'fix: nothing');

    expect(gitCommit).not.toHaveBeenCalled();
  });

  it('refuses to commit when the tree on screen belongs to another workspace', () => {
    useGitStore.setState({ workspaceId: 'ws-b', status, selectedPaths: ['src/a.ts'] });

    useGitStore.getState().commit('ws-a', 'fix: a');

    expect(gitCommit).not.toHaveBeenCalled();
    expect(useGitStore.getState().error).toMatch(/not from this workspace/);
  });

  it('reports a finished commit, clears the selection and rereads the tree', async () => {
    useGitStore.setState({ workspaceId: 'ws-1', status, selectedPaths: ['src/a.ts'] });

    useGitStore.getState().commit('ws-1', 'fix: a');
    await flush();

    expect(useGitStore.getState().lastCommit?.hash).toBe('abc1234');
    expect(useGitStore.getState().selectedPaths).toEqual([]);
    expect(useGitStore.getState().committing).toBe(false);
    expect(gitStatus).toHaveBeenCalledWith('ws-1');
  });

  it('shows why a commit was refused', async () => {
    gitCommit.mockRejectedValueOnce(new Error('git_state_busy: Finish the merge on the desktop first.'));
    useGitStore.setState({ workspaceId: 'ws-1', status, selectedPaths: ['src/a.ts'] });

    useGitStore.getState().commit('ws-1', 'fix: a');
    await flush();

    expect(useGitStore.getState().committing).toBe(false);
    expect(useGitStore.getState().error).toContain('git_state_busy');
  });

  it('toggles a path in and out of the selection', () => {
    useGitStore.getState().toggleSelected('src/a.ts');
    expect(useGitStore.getState().selectedPaths).toEqual(['src/a.ts']);

    useGitStore.getState().toggleSelected('src/a.ts');
    expect(useGitStore.getState().selectedPaths).toEqual([]);
  });

  it('selects every changed file at once', () => {
    useGitStore.setState({ status });

    useGitStore.getState().selectAll();

    expect(useGitStore.getState().selectedPaths.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('selectFiles', () => {
  it('lists one row per path, in path order', () => {
    expect(selectFiles(status).map((file) => file.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('prefers the staged copy of a file changed on both sides', () => {
    const both: GitStatus = {
      ...status,
      files: [
        { path: 'x.ts', status: 'modified', staged: false },
        { path: 'x.ts', status: 'modified', staged: true },
      ],
    };

    expect(selectFiles(both)).toEqual([{ path: 'x.ts', status: 'modified', staged: true }]);
  });

  it('is empty with no status', () => {
    expect(selectFiles(null)).toEqual([]);
  });
});
