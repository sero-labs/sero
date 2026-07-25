import { describe, expect, it } from 'vitest';
import { WORKING_TREE_REV } from '@sero-ai/common';
import { INDEX_REV } from './sero-vcs';
import { isAddedOnFromSide, revsFor } from './diff-revs';

describe('revsFor', () => {
  it('compares a staged file against HEAD, not against the working tree', () => {
    // The distinction that matters: a partially staged file must not show the
    // unstaged part of its changes in the staged row's diff.
    expect(revsFor({ kind: 'working', path: 'a.ts', status: 'modified', staged: true }))
      .toEqual({ fromRev: 'HEAD', toRev: INDEX_REV });
  });

  it('compares the Explorer list against HEAD — it shows staged and unstaged together', () => {
    expect(revsFor({ kind: 'workingCopy', path: 'a.ts', status: 'modified' }))
      .toEqual({ fromRev: 'HEAD', toRev: WORKING_TREE_REV });
  });

  it('compares an unstaged file against the index', () => {
    expect(revsFor({ kind: 'working', path: 'a.ts', status: 'modified', staged: false }))
      .toEqual({ fromRev: INDEX_REV, toRev: WORKING_TREE_REV });
  });

  it('compares a commit against its parent', () => {
    expect(revsFor({ kind: 'commitFile', hash: 'abc1234', path: 'a.ts', status: 'modified' }))
      .toEqual({ fromRev: 'abc1234^', toRev: 'abc1234' });
    expect(revsFor({ kind: 'commit', hash: 'abc1234' }))
      .toEqual({ fromRev: 'abc1234^', toRev: 'abc1234' });
  });
});

describe('isAddedOnFromSide', () => {
  it('treats untracked files as having no previous version', () => {
    expect(isAddedOnFromSide('untracked')).toBe(true);
    expect(isAddedOnFromSide('added')).toBe(true);
    expect(isAddedOnFromSide('modified')).toBe(false);
  });
});
