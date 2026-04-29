import { describe, expect, it } from 'vitest';

import { normalizeGitState } from '../types';

describe('normalizeGitState', () => {
  it('fills in arrays missing from legacy persisted state', () => {
    const state = normalizeGitState({
      repoPath: '/tmp/repo',
      repoName: 'repo',
      currentBranch: 'main',
      headHash: 'abc123',
      branches: [],
      remotes: [],
      commits: [],
      stashes: [],
      fileChanges: [],
      commitCount: 0,
      lastRefresh: '2026-04-06T12:00:00.000Z',
      loading: false,
      syncMode: 'watch',
    });

    expect(state.remoteBranches).toEqual([]);
    expect(state.branches).toEqual([]);
    expect(state.remotes).toEqual([]);
    expect(state.fileChanges).toEqual([]);
    expect(state.currentBranch).toBe('main');
  });

  it('falls back cleanly when persisted values are malformed', () => {
    const state = normalizeGitState({
      branches: undefined,
      remoteBranches: undefined,
      remotes: undefined,
      commits: undefined,
      stashes: undefined,
      fileChanges: undefined,
      commitDiffs: undefined,
      syncMode: 'bogus' as never,
      loading: undefined,
    });

    expect(state.branches).toEqual([]);
    expect(state.remoteBranches).toEqual([]);
    expect(state.remotes).toEqual([]);
    expect(state.commits).toEqual([]);
    expect(state.stashes).toEqual([]);
    expect(state.fileChanges).toEqual([]);
    expect(state.syncMode).toBe('manual');
    expect(state.loading).toBe(false);
  });

  it('maps legacy polling state to manual refresh mode', () => {
    const state = normalizeGitState({
      syncMode: 'poll' as never,
    });

    expect(state.syncMode).toBe('manual');
  });
});
