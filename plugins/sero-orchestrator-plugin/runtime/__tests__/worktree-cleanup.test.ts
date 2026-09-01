import { describe, expect, it } from 'vitest';
import type { Loop, ResolvedWorkspaceContext } from '../../shared/types';
import { rearmLoop } from '../scheduler';
import {
  cleanupPreviousWorktree,
  preservedWorktreeRecord,
  withPreservedWorktree,
} from '../worktree-cleanup';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

/** An active loop whose resolved workspace is `managed`. */
function seedLoop(host: ReturnType<typeof createFakeHost>, managed: ResolvedWorkspaceContext): Loop {
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  return {
    ...loop,
    runtime: { ...loop.runtime, workspace: { ...loop.runtime.workspace, resolved: managed } },
  };
}

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

/**
 * A release that did not free the checkout leaves work on disk. The loop is
 * about to re-arm with a fresh workspace, so the reference to that work has to
 * survive the re-arm or nothing on the loop's side names it again.
 */
describe('preserved checkouts survive re-arming', () => {
  it('records a non-released outcome and carries it through rearmLoop', async () => {
    const host = createFakeHost();
    const managed = await leasedContext(host);
    host.releaseOutcomes.set(managed.leaseId ?? '', {
      status: 'preserved',
      slotId: managed.slotId ?? '',
      reason: 'The branch holds 3 commit(s) the base does not.',
    });
    const loop = seedLoop(host, managed);

    const outcome = await cleanupPreviousWorktree(host, loop.id, managed);
    const carried = withPreservedWorktree(loop, preservedWorktreeRecord(host, managed, outcome));
    const rearmed = rearmLoop(carried, host.now());

    expect(rearmed.runtime.workspace.resolved).toBeUndefined();
    expect(rearmed.runtime.workspace.preservedWorktrees).toEqual([{
      slotId: managed.slotId,
      leaseId: managed.leaseId,
      worktreeKey: 'loop-1-r4',
      worktreePath: managed.worktreePath,
      branchName: managed.branchName,
      outcome: 'preserved',
      reason: 'The branch holds 3 commit(s) the base does not.',
      // The fake clock advances on every read, so the stamp is checked for
      // shape rather than pinned to a value the assertion itself moves.
      at: expect.any(String),
    }]);
  });

  it('records nothing for a checkout that was actually released', async () => {
    const host = createFakeHost();
    const managed = await leasedContext(host);
    const loop = seedLoop(host, managed);

    const outcome = await cleanupPreviousWorktree(host, loop.id, managed);
    const carried = withPreservedWorktree(loop, preservedWorktreeRecord(host, managed, outcome));

    expect(outcome?.status).toBe('released');
    expect(carried.runtime.workspace.preservedWorktrees).toBeUndefined();
  });

  it('keeps one entry per lease and the newest first', async () => {
    const host = createFakeHost();
    const first = await leasedContext(host, 'loop-1-r4');
    const second = await leasedContext(host, 'loop-1-r5');
    for (const context of [first, second]) {
      host.releaseOutcomes.set(context.leaseId ?? '', {
        status: 'recovery-required',
        slotId: context.slotId ?? '',
        reason: 'The checkout could not be verified.',
      });
    }
    let loop = seedLoop(host, first);

    for (const context of [first, second, first]) {
      const outcome = await cleanupPreviousWorktree(host, loop.id, context);
      loop = rearmLoop(withPreservedWorktree(loop, preservedWorktreeRecord(host, context, outcome)), host.now());
    }

    const preserved = loop.runtime.workspace.preservedWorktrees ?? [];
    expect(preserved.map((entry) => entry.worktreeKey)).toEqual(['loop-1-r4', 'loop-1-r5']);
    expect(preserved.every((entry) => entry.outcome === 'recovery-required')).toBe(true);
  });
});
