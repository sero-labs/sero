import { describe, expect, it } from 'vitest';

import type { GitManagerRequest } from '../types';

describe('Git bridge contract', () => {
  it('preserves force and worktreePath on manager requests', () => {
    const forceRemove = {
      action: 'remove_worktree',
      worktreePath: '/tmp/feature-worktree',
      force: true,
    } satisfies GitManagerRequest;
    const forceDelete = {
      action: 'delete_branch',
      branch: 'feature/ui-split',
      force: true,
    } satisfies GitManagerRequest;

    expect(forceRemove.force).toBe(true);
    expect(forceRemove.worktreePath).toBe('/tmp/feature-worktree');
    expect(forceDelete.force).toBe(true);
    expect(forceDelete.branch).toBe('feature/ui-split');
  });
});
