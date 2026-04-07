import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runGitAction } from '../git-service';
import { runGit } from '../git-exec';
import {
  cleanupPaths,
  commitAll,
  createBareRemote,
  createGitRepo,
  statePathFor,
  writeRepoFile,
} from './git-test-helpers';

describe('runGitAction', () => {
  it('unstages all files even before the first commit exists', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'hello\n');
      runGit(['add', 'a.txt'], repoPath);

      const result = await runGitAction({ action: 'unstage', all: true }, repoPath, statePathFor(repoPath));

      expect(result.ok).toBe(true);
      expect(runGit(['status', '--short'], repoPath)).toContain('?? a.txt');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('blocks switching to branches checked out in another worktree', async () => {
    const repoPath = await createGitRepo();
    const worktreePath = path.join(repoPath, 'feature-worktree');

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      runGit(['branch', 'feature'], repoPath);
      runGit(['worktree', 'add', worktreePath, 'feature'], repoPath);

      const result = await runGitAction(
        { action: 'checkout', branch: 'feature' },
        repoPath,
        statePathFor(repoPath),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('already checked out in');
      expect(result.message).toContain(worktreePath);
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('removes linked worktrees and supports force removal for dirty ones', async () => {
    const repoPath = await createGitRepo();
    const worktreePath = path.join(repoPath, 'feature-worktree');

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      runGit(['branch', 'feature'], repoPath);
      runGit(['worktree', 'add', worktreePath, 'feature'], repoPath);
      await writeRepoFile(worktreePath, 'dirty.txt', 'dirty\n');

      const blockedResult = await runGitAction(
        { action: 'remove_worktree', worktreePath },
        repoPath,
        statePathFor(repoPath),
      );
      expect(blockedResult.ok).toBe(false);
      expect(blockedResult.message).toContain('Use force remove to remove it anyway');

      const forcedResult = await runGitAction(
        { action: 'remove_worktree', worktreePath, force: true },
        repoPath,
        statePathFor(repoPath),
      );
      expect(forcedResult.ok).toBe(true);
      expect(runGit(['worktree', 'list', '--porcelain'], repoPath)).not.toContain(worktreePath);
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('blocks removing the main worktree', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');

      const result = await runGitAction(
        { action: 'remove_worktree', worktreePath: repoPath },
        repoPath,
        statePathFor(repoPath),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Cannot remove the main worktree');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('blocks deleting the default branch', async () => {
    const repoPath = await createGitRepo();
    const remotePath = await createBareRemote();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      const defaultBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

      runGit(['remote', 'add', 'origin', remotePath], repoPath);
      runGit(['push', '-u', 'origin', defaultBranch], repoPath);
      runGit(['remote', 'set-head', 'origin', '--auto'], repoPath);

      runGit(['switch', '-c', 'feature'], repoPath);

      const result = await runGitAction(
        { action: 'delete_branch', branch: defaultBranch },
        repoPath,
        statePathFor(repoPath),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Cannot delete the default branch');
    } finally {
      await cleanupPaths([repoPath, remotePath]);
    }
  });

  it('blocks deleting the current branch', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

      const result = await runGitAction(
        { action: 'delete_branch', branch: currentBranch },
        repoPath,
        statePathFor(repoPath),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Cannot delete the current branch');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('supports force-deleting unmerged branches', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'base\n');
      commitAll(repoPath, 'initial');
      const defaultBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

      runGit(['switch', '-c', 'feature'], repoPath);
      await writeRepoFile(repoPath, 'feature.txt', 'feature\n');
      commitAll(repoPath, 'feature work');
      runGit(['switch', defaultBranch], repoPath);

      const blockedResult = await runGitAction(
        { action: 'delete_branch', branch: 'feature' },
        repoPath,
        statePathFor(repoPath),
      );
      expect(blockedResult.ok).toBe(false);
      expect(blockedResult.message).toContain('Use force delete to remove it anyway');

      const forcedResult = await runGitAction(
        { action: 'delete_branch', branch: 'feature', force: true },
        repoPath,
        statePathFor(repoPath),
      );
      expect(forcedResult.ok).toBe(true);
      expect(runGit(['branch', '--list', 'feature'], repoPath)).toBe('');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('applies a stash without dropping it', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'notes.txt', 'base\n');
      commitAll(repoPath, 'initial');

      await writeRepoFile(repoPath, 'notes.txt', 'base\nupdated\n');
      const stashResult = await runGitAction({ action: 'stash' }, repoPath, statePathFor(repoPath));
      expect(stashResult.ok).toBe(true);
      expect(runGit(['stash', 'list'], repoPath)).toContain('stash@{0}');

      const applyResult = await runGitAction(
        { action: 'stash_apply', stashIndex: 0 },
        repoPath,
        statePathFor(repoPath),
      );

      expect(applyResult.ok).toBe(true);
      expect(runGit(['stash', 'list'], repoPath)).toContain('stash@{0}');
      expect(runGit(['status', '--short'], repoPath)).toContain('M notes.txt');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('can auto-stash before cherry-picking onto a dirty working tree', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'app.txt', 'base\n');
      commitAll(repoPath, 'initial');
      const defaultBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

      runGit(['switch', '-c', 'feature'], repoPath);
      await writeRepoFile(repoPath, 'app.txt', 'base\nfeature\n');
      commitAll(repoPath, 'feature change');
      const cherryPickHash = runGit(['rev-parse', 'HEAD'], repoPath);

      runGit(['switch', defaultBranch], repoPath);
      await writeRepoFile(repoPath, 'dirty.txt', 'dirty\n');

      const blockedResult = await runGitAction(
        { action: 'cherry_pick', hash: cherryPickHash },
        repoPath,
        statePathFor(repoPath),
      );
      expect(blockedResult.ok).toBe(false);
      expect(blockedResult.message).toContain('Working tree has uncommitted changes');

      const result = await runGitAction(
        { action: 'cherry_pick', hash: cherryPickHash, all: true },
        repoPath,
        statePathFor(repoPath),
      );

      expect(result.ok).toBe(true);
      expect(runGit(['log', '--format=%s', '-1'], repoPath)).toBe('feature change');
      expect(runGit(['stash', 'list'], repoPath)).toContain('Auto-stash before cherry-pick');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });
});
