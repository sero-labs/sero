import { describe, expect, it } from 'vitest';

import { getFileChanges } from '@electron/features/git/git-service/git-status-queries';
import {
  cleanupPaths,
  commitAll,
  createGitRepo,
  runGit,
  writeRepoFile,
} from './git-test-helpers';

describe('getFileChanges', () => {
  it('keeps the leading status column when the first record is unstaged-only', async () => {
    // Porcelain records an unstaged-only change as " M <path>" — a full trim of
    // the raw output used to eat that leading space, shifting the parse so the
    // file appeared staged as "EADME.md".
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'README.md', 'one\n');
      commitAll(repoPath, 'initial');
      await writeRepoFile(repoPath, 'README.md', 'two\n');

      const changes = await getFileChanges(repoPath);

      expect(changes).toEqual([
        { path: 'README.md', oldPath: undefined, status: 'modified', staged: false },
      ]);
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('splits staged and unstaged sides and resolves renames', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'a\n');
      await writeRepoFile(repoPath, 'b.txt', 'b\n');
      commitAll(repoPath, 'initial');

      await writeRepoFile(repoPath, 'a.txt', 'a2\n');
      runGit(['add', 'a.txt'], repoPath);
      await writeRepoFile(repoPath, 'a.txt', 'a3\n');
      runGit(['mv', 'b.txt', 'renamed.txt'], repoPath);
      await writeRepoFile(repoPath, 'new.txt', 'new\n');

      const changes = await getFileChanges(repoPath);

      expect(changes).toContainEqual({ path: 'a.txt', oldPath: undefined, status: 'modified', staged: true });
      expect(changes).toContainEqual({ path: 'a.txt', oldPath: undefined, status: 'modified', staged: false });
      expect(changes).toContainEqual({ path: 'renamed.txt', oldPath: 'b.txt', status: 'renamed', staged: true });
      expect(changes).toContainEqual({ path: 'new.txt', status: 'untracked', staged: false });
    } finally {
      await cleanupPaths([repoPath]);
    }
  });
});
