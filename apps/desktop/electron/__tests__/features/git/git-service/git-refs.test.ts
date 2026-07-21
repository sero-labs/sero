import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getBranches, getRemoteBranches } from '@electron/features/git/git-service/git-refs';
import {
  runGit,
  cleanupPaths,
  commitAll,
  createBareRemote,
  createGitRepo,
  writeRepoFile,
} from './git-test-helpers';

describe('git refs helpers', () => {
  it('marks branches checked out in linked worktrees and sorts by branch activity rather than current selection', async () => {
    const repoPath = await createGitRepo();
    const worktreePath = path.join(repoPath, 'feature-worktree');

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      runGit(['branch', 'feature'], repoPath);
      runGit(['worktree', 'add', worktreePath, 'feature'], repoPath);

      runGit(['switch', 'feature'], worktreePath);
      await writeRepoFile(worktreePath, 'feature.txt', 'feature\n');
      commitAll(worktreePath, 'feature work');

      const branches = await getBranches(repoPath);

      expect(branches[0]?.name).toBe('feature');
      expect(branches.find((branch) => branch.name === 'feature')?.checkedOutIn).toContain('feature-worktree');
      expect(branches.find((branch) => branch.name === runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath))?.current).toBe(true);
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('lists fetched remote branches and excludes remote HEAD aliases', async () => {
    const repoPath = await createGitRepo();
    const remotePath = await createBareRemote();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      const defaultBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

      runGit(['remote', 'add', 'origin', remotePath], repoPath);
      runGit(['push', '-u', 'origin', defaultBranch], repoPath);

      runGit(['switch', '-c', 'feature'], repoPath);
      await writeRepoFile(repoPath, 'feature.txt', 'feature\n');
      commitAll(repoPath, 'feature');
      runGit(['push', '-u', 'origin', 'feature'], repoPath);
      runGit(['switch', defaultBranch], repoPath);
      runGit(['fetch', '--all', '--prune'], repoPath);

      const remoteBranches = (await getRemoteBranches(repoPath)).map((branch) => branch.name);

      expect(remoteBranches).toContain(`origin/${defaultBranch}`);
      expect(remoteBranches).toContain('origin/feature');
      expect(remoteBranches.some((branch) => branch.endsWith('/HEAD'))).toBe(false);
    } finally {
      await cleanupPaths([repoPath, remotePath]);
    }
  });
});
