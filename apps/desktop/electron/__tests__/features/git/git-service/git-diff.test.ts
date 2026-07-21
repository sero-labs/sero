import { describe, expect, it } from 'vitest';

import { getCommitDiff, getFileDiff } from '@electron/features/git/git-service/git-commands';
import {
  runGit,
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
      const diff = await getFileDiff(repoPath, 'b.txt', true);

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

      const diffs = await getCommitDiff(repoPath, renameCommitHash);

      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.status).toBe('renamed');
      expect(diffs[0]?.oldPath).toBe('a.txt');
      expect(diffs[0]?.path).toBe('b.txt');
    } finally {
      await cleanupPaths([repoPath]);
    }
  });
});
