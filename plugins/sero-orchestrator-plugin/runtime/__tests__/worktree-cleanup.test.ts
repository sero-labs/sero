import { describe, expect, it } from 'vitest';
import type { ResolvedWorkspaceContext } from '../../shared/types';
import { cleanupPreviousWorktree } from '../worktree-cleanup';
import { createFakeHost } from './fake-host';

const managed: ResolvedWorkspaceContext = {
  id: 'ws-1',
  type: 'managed-worktree',
  workspaceRoot: '/workspace',
  cwd: '/workspace/.sero/worktrees/loop-1-r4',
  worktreePath: '/workspace/.sero/worktrees/loop-1-r4',
  branchName: 'fix/task-loop-1-r4',
  worktreeKey: 'loop-1-r4',
  resolvedBy: 'create-option',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('cleanupPreviousWorktree', () => {
  it('removes merged loop-owned branches safely', async () => {
    const host = createFakeHost();
    const result = await cleanupPreviousWorktree(host, 'loop-1', managed);
    expect(result).toEqual({ removed: true });
    expect(host.checkpoints).toEqual([]);
    expect(host.worktreeRemovals).toEqual([
      { loopId: 'loop-1-r4', force: undefined, deleteMergedBranch: true, deleteBranch: undefined },
    ]);
  });

  it('never deletes an external pull-request branch', async () => {
    const host = createFakeHost();
    await cleanupPreviousWorktree(host, 'loop-1', { ...managed, externalBranch: true });
    expect(host.worktreeRemovals[0].deleteMergedBranch).toBeUndefined();
    expect(host.checkpoints).toEqual([]);
  });

  it('reports a kept checkout without creating a commit', async () => {
    const host = createFakeHost();
    host.removeWorktree = async () => {
      throw new Error('dirty checkout');
    };

    const result = await cleanupPreviousWorktree(host, 'loop-1', managed);

    expect(result).toEqual({
      removed: false,
      error: expect.stringContaining(`checkout was kept at ${managed.worktreePath}`),
    });
    expect(host.checkpoints).toEqual([]);
    expect(host.logs).toEqual([expect.stringContaining('dirty checkout')]);
  });
});
