import { describe, expect, it } from 'vitest';
import type { ResolvedWorkspaceContext } from '../../shared/types';
import { cleanupPreviousWorktree } from '../worktree-cleanup';
import { createFakeHost } from './fake-host';

/**
 * Cleanup is fenced on the run's exact lease identity, never on its logical
 * key: a key-addressed release arriving late would act on whatever that key
 * now points at.
 */
async function leasedContext(host: ReturnType<typeof createFakeHost>, holder = 'loop-1-r4'): Promise<ResolvedWorkspaceContext> {
  const outcome = await host.acquireWorktree({ holder, title: 'Task' });
  if (outcome.status !== 'acquired') throw new Error(outcome.reason);
  return {
    id: 'ws-1',
    type: 'managed-worktree',
    workspaceRoot: host.workspacePath,
    cwd: outcome.lease.worktreePath,
    worktreePath: outcome.lease.worktreePath,
    branchName: outcome.lease.branchName,
    worktreeKey: holder,
    slotId: outcome.lease.slotId,
    leaseId: outcome.lease.leaseId,
    resolvedBy: 'create-option',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('cleanupPreviousWorktree', () => {
  it('releases the run\'s own lease and asks for merged-branch deletion', async () => {
    const host = createFakeHost();
    const managed = await leasedContext(host);

    const outcome = await cleanupPreviousWorktree(host, 'loop-1', managed);

    expect(outcome?.status).toBe('released');
    expect(host.worktreeRemovals).toEqual([
      {
        loopId: 'loop-1-r4',
        slotId: managed.slotId,
        leaseId: managed.leaseId,
        disposition: 'recycle',
        deleteMergedBranch: true,
      },
    ]);
  });

  it('never deletes an external pull-request branch', async () => {
    const host = createFakeHost();
    const managed = await leasedContext(host);

    await cleanupPreviousWorktree(host, 'loop-1', { ...managed, externalBranch: true });

    expect(host.worktreeRemovals[0].deleteMergedBranch).toBeUndefined();
  });

  it('cannot release a slot that has since taken a newer lease', async () => {
    const host = createFakeHost();
    const stale = await leasedContext(host);
    // The slot is released and re-leased; the first run's cleanup arrives late.
    await cleanupPreviousWorktree(host, 'loop-1', stale);
    const current = await leasedContext(host, 'loop-1-r5');
    host.worktreeRemovals.length = 0;

    const outcome = await cleanupPreviousWorktree(host, 'loop-1', { ...stale, slotId: current.slotId });

    expect(outcome?.status).toBe('stale-lease');
    expect(host.worktreeRemovals).toEqual([]);
  });

  it('leaves a pre-pool checkout alone rather than releasing it by key', async () => {
    const host = createFakeHost();
    const legacy: ResolvedWorkspaceContext = {
      id: 'ws-legacy',
      type: 'managed-worktree',
      workspaceRoot: host.workspacePath,
      cwd: `${host.workspacePath}/.sero/worktrees/card-loop-1-r4`,
      worktreePath: `${host.workspacePath}/.sero/worktrees/card-loop-1-r4`,
      branchName: 'fix/task-loop-1-r4',
      worktreeKey: 'loop-1-r4',
      resolvedBy: 'create-option',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    expect(await cleanupPreviousWorktree(host, 'loop-1', legacy)).toBeNull();
    expect(host.worktreeRemovals).toEqual([]);
  });
});
