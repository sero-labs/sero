import { describe, expect, it } from 'vitest';

import { refreshGitState } from '../git-service';
import {
  cleanupPaths,
  commitAll,
  createGitRepo,
  statePathFor,
  writeRepoFile,
} from './git-test-helpers';

describe('refreshGitState', () => {
  it('uses quick refresh mode when HEAD and branch are unchanged', async () => {
    const repoPath = await createGitRepo();
    const statePath = statePathFor(repoPath);

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');

      const initialState = await refreshGitState(repoPath, statePath, { scope: 'full' });
      await writeRepoFile(repoPath, 'notes.txt', 'dirty\n');

      const refreshedState = await refreshGitState(repoPath, statePath, { scope: 'auto' });

      expect(refreshedState.headHash).toBe(initialState.headHash);
      expect(refreshedState.currentBranch).toBe(initialState.currentBranch);
      expect(refreshedState.commits).toEqual(initialState.commits);
      expect(refreshedState.branches).toEqual(initialState.branches);
      expect(refreshedState.remoteBranches).toEqual(initialState.remoteBranches);
      expect(refreshedState.fileChanges.some((file) => file.path === 'notes.txt')).toBe(true);
    } finally {
      await cleanupPaths([repoPath]);
    }
  });
});
