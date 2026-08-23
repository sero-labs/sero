import { describe, expect, it, vi } from 'vitest';

import { refreshGitState } from '@electron/features/git/git-service/git-service';
import * as gitRefresh from '@electron/features/git/git-service/git-refresh';
import {
  runGit,
  cleanupPaths,
  createGitRepo,
  createSeededRepo,
  statePathFor,
  writeRepoFile,
} from './git-test-helpers';

describe('refreshGitState', () => {
  it('refreshes an initialized repo before the first commit exists', async () => {
    const repoPath = await createGitRepo();
    const statePath = statePathFor(repoPath);

    try {
      await writeRepoFile(repoPath, 'draft.txt', 'draft\n');

      const state = await refreshGitState(repoPath, statePath, { scope: 'full' });

      expect(state.error).toBeUndefined();
      expect(state.currentBranch).not.toBe('');
      expect(state.headHash).toBe('');
      expect(state.commits).toEqual([]);
      expect(state.commitCount).toBe(0);
      expect(state.fileChanges).toContainEqual({
        path: 'draft.txt',
        status: 'untracked',
        staged: false,
      });
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('uses quick refresh mode when HEAD and branch are unchanged', async () => {
    const repoPath = await createSeededRepo({ 'a.txt': 'base\n' });
    const statePath = statePathFor(repoPath);

    try {
      const initialState = await refreshGitState(repoPath, statePath, { scope: 'full' });
      await writeRepoFile(repoPath, 'notes.txt', 'dirty\n');
      const quickRefresh = vi.spyOn(gitRefresh, 'createQuickRefreshState');

      try {
        const refreshedState = await refreshGitState(repoPath, statePath, { scope: 'auto' });

        expect(quickRefresh).toHaveBeenCalledTimes(1);
        expect(refreshedState.headHash).toBe(initialState.headHash);
        expect(refreshedState.currentBranch).toBe(initialState.currentBranch);
        expect(refreshedState.commits).toEqual(initialState.commits);
        expect(refreshedState.branches).toEqual(initialState.branches);
        expect(refreshedState.remoteBranches).toEqual(initialState.remoteBranches);
        expect(refreshedState.fileChanges.some((file) => file.path === 'notes.txt')).toBe(true);
      } finally {
        quickRefresh.mockRestore();
      }
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('falls back to a full refresh when refs change without a HEAD update', async () => {
    const repoPath = await createSeededRepo({ 'a.txt': 'base\n' });
    const statePath = statePathFor(repoPath);

    try {
      await refreshGitState(repoPath, statePath, { scope: 'full' });

      runGit(['branch', 'feature'], repoPath);
      const refreshedState = await refreshGitState(repoPath, statePath, { scope: 'auto' });

      expect(refreshedState.branches.some((branch) => branch.name === 'feature')).toBe(true);
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('excludes internal turn-undo refs from visible commit history and counts', async () => {
    const repoPath = await createSeededRepo({ 'a.txt': 'base\n' });
    const statePath = statePathFor(repoPath);

    try {

      const headTree = runGit(['rev-parse', 'HEAD^{tree}'], repoPath);
      const hiddenCommit = runGit([
        'commit-tree',
        headTree,
        '-p',
        'HEAD',
        '-m',
        'turn-undo snapshot 1776459831589-test-hidden-ref',
      ], repoPath);
      runGit(['update-ref', 'refs/sero/turn-undo/1776459831589-test-hidden-ref', hiddenCommit], repoPath);

      const refreshedState = await refreshGitState(repoPath, statePath, { scope: 'full' });

      expect(refreshedState.commitCount).toBe(1);
      expect(refreshedState.commits).toHaveLength(1);
      expect(refreshedState.commits[0]?.subject).toBe('initial');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });
});
