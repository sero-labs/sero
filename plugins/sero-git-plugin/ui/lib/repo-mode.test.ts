import { describe, expect, it } from 'vitest';

import type { FileChange, GitAppState } from '../../shared/types';
import { createDefaultGitState } from '../../shared/types';
import { branchChipLabel, deriveRepoMode } from './repo-mode';

function state(overrides: Partial<GitAppState>): GitAppState {
  return {
    ...createDefaultGitState(),
    currentBranch: 'main',
    headHash: 'abc1234',
    commitCount: 12,
    remotes: [{ name: 'origin', fetchUrl: 'git@github.com:a/b.git', pushUrl: '' }],
    ...overrides,
  };
}

const conflicted: FileChange[] = [
  { path: 'src/parse.ts', status: 'conflict', staged: false },
  { path: 'CHANGELOG.md', status: 'conflict', staged: false },
];

describe('deriveRepoMode', () => {
  it('is normal on a branch with history', () => {
    expect(deriveRepoMode(state({})).mode).toBe('normal');
  });

  it('counts down the conflicts a merge has left, on the commit button', () => {
    const info = deriveRepoMode(state({
      merge: { fromRef: 'feat/changelog', message: 'Merge branch', conflictPaths: ['src/parse.ts', 'CHANGELOG.md'] },
      fileChanges: conflicted,
    }));

    expect(info.mode).toBe('merging');
    expect(info.commitLabel).toBe('Conclude merge');
    expect(info.commitBlockedReason).toBe('2 conflicts left to resolve');
    expect(info.pushBlockedReason).toBeTruthy();
  });

  it('lets the merge conclude once nothing conflicts', () => {
    const info = deriveRepoMode(state({
      merge: { fromRef: 'feat/changelog', message: 'Merge branch', conflictPaths: ['src/parse.ts'] },
      fileChanges: [{ path: 'src/parse.ts', status: 'modified', staged: true }],
    }));

    expect(info.commitBlockedReason).toBeNull();
  });

  // The state most likely to lose work silently, so committing is off with the
  // reason attached rather than quietly creating an orphan.
  it('blocks committing on a detached HEAD but leaves fetch alone', () => {
    const info = deriveRepoMode(state({ detached: true, currentBranch: 'HEAD' }));

    expect(info.mode).toBe('detached');
    expect(info.commitBlockedReason).toMatch(/Name a branch first/);
    expect(info.fetchBlockedReason).toBeNull();
    expect(info.pushBlockedReason).toBeTruthy();
  });

  it('treats a branch with no commits as unborn, and offers the first commit', () => {
    const info = deriveRepoMode(state({
      headHash: '',
      commitCount: 0,
      remotes: [],
      fileChanges: [{ path: 'README.md', status: 'untracked', staged: false }],
    }));

    expect(info.mode).toBe('unborn');
    expect(info.commitLabel).toBe('Create the first commit');
    expect(info.commitBlockedReason).toBeNull();
  });

  it('reads a merge as merging even on a detached HEAD', () => {
    const info = deriveRepoMode(state({
      detached: true,
      merge: { fromRef: 'topic', message: 'Merge branch', conflictPaths: [] },
    }));

    expect(info.mode).toBe('merging');
  });
});

// `useAppState` merges the state file over the default key by key. Before
// `@sero-ai/app-runtime` 0.2.1 it also kept the default whenever the types
// differed — and `undefined` matches nothing, so any optional field defaulted
// to `undefined` was erased on the way in. That is how the merge state and
// `defaultBranch` went missing. The hook is fixed; this keeps the git state
// safe on a host still pinned to 0.2.0.
describe('the default state', () => {
  it('holds no undefined values, or optional fields never arrive', () => {
    const undefinedKeys = Object.entries(createDefaultGitState())
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);

    expect(undefinedKeys).toEqual([]);
  });
});

describe('branchChipLabel', () => {
  it('names where you are in each mode', () => {
    expect(branchChipLabel(state({}), 'normal')).toBe('main');
    expect(branchChipLabel(state({ headHash: '878b180' }), 'detached')).toBe('detached at 878b180');
    expect(branchChipLabel(state({ headHash: '' }), 'unborn')).toBe('main · unborn');
  });
});

/**
 * Undoing an AI resolution puts the file back to genuinely conflicted — git's
 * own index stages, not a marker-shaped imitation — so the mode is derived from
 * `git status` alone and needs no memory of its own.
 */
describe('a file that is conflicted again after an undo', () => {
  const merging = {
    ...createDefaultGitState(),
    headHash: 'abc1234',
    commitCount: 3,
    fileChanges: [
      { path: 'src/parse.ts', status: 'conflict' as const, staged: false },
      { path: 'README.md', status: 'modified' as const, staged: true },
    ],
    merge: {
      fromRef: 'feat/x',
      message: 'Merge branch',
      conflictPaths: ['src/parse.ts'],
    },
  };

  it('blocks the merge, because git reports it as unmerged', () => {
    const info = deriveRepoMode(merging);
    expect(info.conflicts).toBe(1);
    expect(info.commitBlockedReason).toBe('1 conflict left to resolve');
  });

  it('lets the merge conclude once git stops calling it conflicted', () => {
    const resolved = {
      ...merging,
      fileChanges: [
        { path: 'src/parse.ts', status: 'modified' as const, staged: true },
        { path: 'README.md', status: 'modified' as const, staged: true },
      ],
    };
    const info = deriveRepoMode(resolved);
    expect(info.conflicts).toBe(0);
    expect(info.commitBlockedReason).toBeNull();
  });
});
