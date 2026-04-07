import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runGitAction } from '../git-service';
import { runGit } from '../git-exec';
import {
  cleanupPaths,
  commitAll,
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
