import { describe, expect, it } from 'vitest';

import { getCommitDiff, getFileDiff } from '../git-commands';
import { runGit } from '../git-exec';
import {
  cleanupPaths,
  commitAll,
  createGitRepo,
  writeRepoFile,
} from './git-test-helpers';

describe('diff parsing', () => {
  it('includes oldPath metadata for staged renames', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'hello\n');
      commitAll(repoPath, 'initial');

      runGit(['mv', 'a.txt', 'b.txt'], repoPath);
      const diff = getFileDiff(repoPath, 'b.txt', true);

      expect(diff).not.toBeNull();
      expect(diff?.status).toBe('renamed');
      expect(diff?.oldPath).toBe('a.txt');
      expect(diff?.path).toBe('b.txt');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });

  it('includes oldPath metadata for committed renames', async () => {
    const repoPath = await createGitRepo();

    try {
      await writeRepoFile(repoPath, 'a.txt', 'hello\n');
      commitAll(repoPath, 'initial');

      runGit(['mv', 'a.txt', 'b.txt'], repoPath);
      commitAll(repoPath, 'rename file');
      const renameCommitHash = runGit(['rev-parse', 'HEAD'], repoPath);

      const diffs = getCommitDiff(repoPath, renameCommitHash);

      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.status).toBe('renamed');
      expect(diffs[0]?.oldPath).toBe('a.txt');
      expect(diffs[0]?.path).toBe('b.txt');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });
});
