import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { diffKey, selectFiles, useGitStore, type GitStatus } from '@/stores/git';
import type { GatewayMessage } from '@/lib/gateway-client';

const gitStatus = vi.fn((_workspaceId: string) => {});
const gitDiff = vi.fn((_workspaceId: string, _path: string, _staged: boolean) => {});
const gitCommit = vi.fn((_workspaceId: string, _message: string, _paths: string[]) => {});

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

function statusResponse(data: unknown): GatewayMessage {
  return { type: 'ok', requestType: 'git_status', data } as GatewayMessage;
}

describe('git store', () => {
  beforeEach(() => {
    gitStatus.mockClear();
    gitDiff.mockClear();
    gitCommit.mockClear();
    useConnectionStore.setState({
      client: { gitStatus, gitDiff, gitCommit } as unknown as never,
    });
    useGitStore.setState({
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
  });

  it('stores the working tree it gets back', () => {
    useGitStore.getState().handleMessage(statusResponse(status));

    expect(useGitStore.getState().status?.branch).toBe('main');
    expect(useGitStore.getState().status?.files).toHaveLength(2);
    expect(useGitStore.getState().loading).toBe(false);
  });

  it('ignores a malformed status', () => {
    useGitStore.getState().handleMessage(statusResponse({ branch: 'main' }));

    expect(useGitStore.getState().status).toBeNull();
  });

  it('drops the old diffs on a refresh, because the tree moved', () => {
    useGitStore.setState({ diffs: { 'working:src/a.ts': { path: 'src/a.ts' } as never } });

    useGitStore.getState().handleMessage(statusResponse(status));

    expect(useGitStore.getState().diffs).toEqual({});
  });

  it('drops a selected path that is no longer changed', () => {
    useGitStore.setState({ selectedPaths: ['src/a.ts', 'gone.ts'] });

    useGitStore.getState().handleMessage(statusResponse(status));

    expect(useGitStore.getState().selectedPaths).toEqual(['src/a.ts']);
  });

  it('fetches a diff the first time a file is opened', () => {
    useGitStore.getState().openFile('ws-1', { path: 'src/a.ts', status: 'modified', staged: false });

    expect(gitDiff).toHaveBeenCalledWith('ws-1', 'src/a.ts', false);
    expect(useGitStore.getState().openPath).toBe('src/a.ts');
  });

  it('does not fetch a diff it already holds', () => {
    useGitStore.setState({
      diffs: { [diffKey('src/a.ts', false)]: { path: 'src/a.ts' } as never },
    });

    useGitStore.getState().openFile('ws-1', { path: 'src/a.ts', status: 'modified', staged: false });

    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('keeps the staged and working diffs of one file apart', () => {
    useGitStore.getState().handleMessage({
      type: 'ok',
      requestType: 'git_diff',
      data: { path: 'src/a.ts', staged: true, hunks: [] },
    } as GatewayMessage);

    expect(Object.keys(useGitStore.getState().diffs)).toEqual(['staged:src/a.ts']);
  });

  it('refetches the tree when a turn finishes', () => {
    useGitStore.setState({ status });

    useGitStore.getState().handleMessage({
      type: 'turn_complete',
      workspaceId: 'ws-1',
      sessionId: 's1',
      ts: Date.now(),
      outcome: 'completed',
    } as unknown as GatewayMessage);

    expect(gitStatus).toHaveBeenCalledWith('ws-1');
  });

  it('does not refetch before the panel was ever opened', () => {
    useGitStore.getState().handleMessage({
      type: 'turn_complete',
      workspaceId: 'ws-1',
      sessionId: 's1',
      ts: Date.now(),
      outcome: 'completed',
    } as unknown as GatewayMessage);

    expect(gitStatus).not.toHaveBeenCalled();
  });

  it('commits only the selected paths', () => {
    useGitStore.setState({ status, selectedPaths: ['src/a.ts'] });

    useGitStore.getState().commit('ws-1', 'fix: a');

    expect(gitCommit).toHaveBeenCalledWith('ws-1', 'fix: a', ['src/a.ts']);
    expect(useGitStore.getState().committing).toBe(true);
  });

  it('sends nothing when no file is selected', () => {
    useGitStore.getState().commit('ws-1', 'fix: nothing');

    expect(gitCommit).not.toHaveBeenCalled();
  });

  it('reports a finished commit and clears the selection', () => {
    useGitStore.setState({ committing: true, selectedPaths: ['src/a.ts'] });

    useGitStore.getState().handleMessage({
      type: 'ok',
      requestType: 'git_commit',
      data: { hash: 'abc1234', branch: 'main', fileCount: 1 },
    } as GatewayMessage);

    expect(useGitStore.getState().lastCommit?.hash).toBe('abc1234');
    expect(useGitStore.getState().selectedPaths).toEqual([]);
    expect(useGitStore.getState().committing).toBe(false);
  });

  it('shows why a commit was refused', () => {
    useGitStore.setState({ committing: true });

    useGitStore.getState().handleMessage({
      type: 'error',
      requestType: 'git_commit',
      message: 'git_state_busy: Finish the merge on the desktop first.',
    } as GatewayMessage);

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

  it('prefers the staged copy when a file is in both', () => {
    const both: GitStatus = {
      ...status,
      files: [
        { path: 'src/a.ts', status: 'modified', staged: false },
        { path: 'src/a.ts', status: 'modified', staged: true },
      ],
    };

    const files = selectFiles(both);

    expect(files).toHaveLength(1);
    expect(files[0]?.staged).toBe(true);
  });

  it('returns nothing before a status arrives', () => {
    expect(selectFiles(null)).toEqual([]);
  });
});
