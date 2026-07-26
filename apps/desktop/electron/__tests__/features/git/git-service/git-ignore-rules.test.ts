/**
 * The linked-worktree case for Sero's own ignore rules.
 *
 * The rules themselves — what they cover, that they go in `.git/info/exclude`
 * and not the project's `.gitignore`, that they are not repeated on every
 * refresh — are pinned in `../sero-files-ignored.test.ts`. Only the worktree
 * lives here, because it fails for a reason none of those catch.
 *
 * In a linked worktree `git rev-parse --git-dir` answers
 * `.git/worktrees/<name>`, which is *not* where git reads `info/exclude` from:
 * it reads the shared one in the main repository. Deriving the path from
 * `--git-dir` therefore wrote a file git never looks at, and Sero's state kept
 * showing up as untracked changes in every worktree.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { refreshGitState } from '@electron/features/git/git-service/git-service-core';
import {
  runGit,
  cleanupPaths,
  commitAll,
  createGitRepo,
  statePathFor,
  writeRepoFile,
} from './git-test-helpers';

describe("Sero's ignore rules in a linked worktree", () => {
  it('reach the shared exclude file, and take effect', async () => {
    const repoPath = await createGitRepo();
    const worktreePath = `${repoPath}-worktree`;

    try {
      await writeRepoFile(repoPath, 'a.txt', 'hello\n');
      commitAll(repoPath, 'first');
      runGit(['worktree', 'add', worktreePath, '-b', 'feature'], repoPath);

      await refreshGitState(worktreePath, statePathFor(worktreePath));

      // What actually matters: git itself ignores our state from in here.
      expect(runGit(['check-ignore', '.sero/apps/git/state.json'], worktreePath)).not.toBe('');
      expect(runGit(['check-ignore', '.sero-workspace.json'], worktreePath)).not.toBe('');

      // And it got there via the shared file, not one buried in the worktree's
      // own git directory where nothing would ever read it.
      const shared = await readFile(path.join(repoPath, '.git', 'info', 'exclude'), 'utf8');
      expect(shared).toContain('**/.sero/');
      const worktreeGitDir = path.join(repoPath, '.git', 'worktrees', path.basename(worktreePath));
      expect(existsSync(path.join(worktreeGitDir, 'info', 'exclude'))).toBe(false);
    } finally {
      await cleanupPaths([repoPath, worktreePath]);
    }
  });
});
