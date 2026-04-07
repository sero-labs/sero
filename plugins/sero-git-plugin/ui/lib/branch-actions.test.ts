import { describe, expect, it } from 'vitest';

import type { BranchInfo } from '../../shared/types';
import { canDeleteBranch, isDefaultBranch } from './branch-actions';

function makeBranch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: 'feature/test',
    current: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

describe('branch action helpers', () => {
  it('allows deleting non-current branches not checked out elsewhere', () => {
    expect(canDeleteBranch(makeBranch(), 'main')).toBe(true);
  });

  it('detects the default branch', () => {
    expect(isDefaultBranch(makeBranch({ name: 'main' }), 'main')).toBe(true);
    expect(isDefaultBranch(makeBranch({ name: 'feature/test' }), 'main')).toBe(false);
  });

  it('blocks deleting the current branch', () => {
    expect(canDeleteBranch(makeBranch({ name: 'main' }), 'main')).toBe(false);
    expect(canDeleteBranch(makeBranch({ current: true }), 'feature/test')).toBe(false);
  });

  it('blocks deleting branches checked out in another worktree', () => {
    expect(canDeleteBranch(makeBranch({ checkedOutIn: '/tmp/worktree' }), 'main')).toBe(false);
  });

  it('blocks deleting the default branch', () => {
    expect(canDeleteBranch(makeBranch({ name: 'main' }), 'feature/test', 'main')).toBe(false);
  });
});
