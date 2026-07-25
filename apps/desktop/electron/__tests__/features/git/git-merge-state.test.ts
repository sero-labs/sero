import { beforeEach, describe, expect, it, vi } from 'vitest';

const git = vi.hoisted(() => vi.fn());

vi.mock('@electron/features/git/git-service/git-command-support', () => ({ git }));

import {
  isDetachedHead,
  readMergeState,
} from '@electron/features/git/git-service/git-merge-state';

/** Answers each `git` call by matching its first two arguments. */
function respond(table: Record<string, string>): void {
  git.mockImplementation((args: string[]) => {
    const key = args.slice(0, 2).join(' ');
    return Promise.resolve(table[key] ?? '');
  });
}

describe('isDetachedHead', () => {
  beforeEach(() => { git.mockReset(); });

  it('is false on a branch, including an unborn one', async () => {
    respond({ 'symbolic-ref --quiet': 'refs/heads/main' });
    expect(await isDetachedHead('/repo')).toBe(false);
  });

  it('is true when HEAD names no branch', async () => {
    respond({});
    expect(await isDetachedHead('/repo')).toBe(true);
  });
});

describe('readMergeState', () => {
  beforeEach(() => { git.mockReset(); });

  it('is undefined when no merge is in progress', async () => {
    respond({});
    expect(await readMergeState('/repo')).toBeUndefined();
  });

  it('names the branch being merged in and lists the conflicts', async () => {
    respond({
      'rev-parse --verify': 'a1b2c3d4e5f6',
      'name-rev --name-only': 'feat/changelog',
      'diff --name-only': 'src/lib/parse.ts\nCHANGELOG.md',
    });

    expect(await readMergeState('/repo')).toEqual({
      fromRef: 'feat/changelog',
      message: '',
      conflictPaths: ['CHANGELOG.md', 'src/lib/parse.ts'],
    });
  });

  it('falls back to a short sha when git cannot name the ref', async () => {
    respond({
      'rev-parse --verify': 'a1b2c3d4e5f6',
      'name-rev --name-only': 'undefined',
    });

    expect((await readMergeState('/repo'))?.fromRef).toBe('a1b2c3d');
  });

  // Git forgets a conflict once the file is staged; without carrying the set
  // forward, a resolved file would look like one that merged cleanly.
  it('keeps paths that conflicted earlier in the same merge', async () => {
    respond({
      'rev-parse --verify': 'a1b2c3d4e5f6',
      'name-rev --name-only': 'feat/changelog',
      'diff --name-only': 'CHANGELOG.md',
    });

    const state = await readMergeState('/repo', {
      fromRef: 'feat/changelog',
      message: "Merge branch 'feat/changelog'",
      conflictPaths: ['src/lib/parse.ts'],
    });

    expect(state?.conflictPaths).toEqual(['CHANGELOG.md', 'src/lib/parse.ts']);
  });
});
