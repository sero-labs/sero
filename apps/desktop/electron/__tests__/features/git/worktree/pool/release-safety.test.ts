/**
 * A matching lease id is not a licence to delete.
 *
 * `openPool()` weighs every slot against Git registration and the filesystem
 * before a release is even considered. This suite holds the rule that the
 * verdict wins: a detached checkout, a changed branch, a locked or missing
 * registration, or a branch comparison Git could not answer all preserve the
 * checkout, however sound the caller's identity is.
 *
 * The damaged slots share one repository. They are independent checkouts of
 * it, so building four repositories to hold four slots would buy nothing but
 * subprocesses.
 */

import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import { releaseWorktree } from '@electron/features/git/worktree/pool/release';
import type { AppRuntimeWorktreeLease } from '@sero-ai/common';
import type { PoolState } from '@electron/features/git/worktree/pool/types';
import { git, newWorkspaceRepo, removeWorkspaceRepos } from '../worktree-test-helpers';

// Real Git against real repositories: each case spawns several subprocesses,
// and the default 5s budget is a timing assertion nobody meant to write. It
// fires under full-suite parallelism and passes in isolation, which is the
// worst kind of failure to read.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

async function newWorkspace(): Promise<string> {
  return (await newWorkspaceRepo('sero-pool-rel-')).workspace;
}

async function lease(workspace: string, holder: string): Promise<AppRuntimeWorktreeLease> {
  const outcome = await acquireWorktree(workspace, { holder, title: 'Fix the parser' });
  if (outcome.status !== 'acquired') throw new Error(outcome.reason);
  return outcome.lease;
}

function statePath(workspace: string): string {
  return path.join(workspace, '.git', 'sero-worktree-pool', 'pool.json');
}

async function exists(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null)) !== null;
}

/** Points a lease's recorded base at a commit that does not exist. */
async function breakBaseCommit(workspace: string, slotId: string): Promise<void> {
  const raw = JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
  await writeFile(statePath(workspace), JSON.stringify({
    ...raw,
    slots: raw.slots.map((slot) => (slot.slotId === slotId && slot.lease
      ? { ...slot, lease: { ...slot.lease, baseCommit: '0'.repeat(40) } }
      : slot)),
  }), 'utf8');
}

afterAll(removeWorkspaceRepos);

describe('a rejected slot is never released', () => {
  /**
   * `remove` is the permissive disposition — the one that disposes of
   * committed work when everything checks out. Proving IT refuses is the
   * strong direction; `recycle` only ever keeps more. The detached case below
   * pins that claim explicitly rather than leaving it to reasoning.
   */
  it('preserves every checkout whose evidence disagrees', async () => {
    const workspace = await newWorkspace();
    const [detached, moved, locked, unreadableBase] = await Promise.all([
      lease(workspace, 'loop-detached-r1'),
      lease(workspace, 'loop-moved-r1'),
      lease(workspace, 'loop-locked-r1'),
      lease(workspace, 'loop-base-r1'),
    ]);

    await git(detached.worktreePath, 'checkout', '--detach');
    await git(moved.worktreePath, 'checkout', '-b', 'feat/somewhere-else');
    await git(workspace, 'worktree', 'lock', '--reason', 'the installer is running', locked.worktreePath);
    await breakBaseCommit(workspace, unreadableBase.slotId);

    const release = (target: AppRuntimeWorktreeLease) => releaseWorktree(workspace, {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'remove',
    });

    expect(await release(detached)).toMatchObject({ status: 'recovery-required' });
    expect((await release(moved)).reason).toContain('feat/somewhere-else');
    expect((await release(locked)).reason).toContain('the installer is running');
    expect((await release(unreadableBase)).reason).toContain('could not be compared');

    for (const target of [detached, moved, locked, unreadableBase]) {
      expect(await exists(target.worktreePath), target.slotId).toBe(true);
    }
  });

  it('refuses under recycle too, not only under remove', async () => {
    const workspace = await newWorkspace();
    const target = await lease(workspace, 'loop-detached-r1');
    await git(target.worktreePath, 'checkout', '--detach');

    const outcome = await releaseWorktree(workspace, {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'recycle',
    });

    expect(outcome.status).toBe('recovery-required');
    expect(await exists(target.worktreePath)).toBe(true);
  });

  it('preserves a directory Git no longer registers', async () => {
    // Repo-wide damage, so this one owns its repository.
    const workspace = await newWorkspace();
    const target = await lease(workspace, 'loop-unregistered-r1');
    await writeFile(path.join(target.worktreePath, 'work.md'), 'hours of work');
    await rm(path.join(workspace, '.git', 'worktrees'), { recursive: true, force: true });

    const outcome = await releaseWorktree(workspace, {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'remove',
    });

    expect(outcome.status).toBe('recovery-required');
    expect(await readFile(path.join(target.worktreePath, 'work.md'), 'utf8')).toBe('hours of work');
  });
});

describe('a preserved checkout keeps its owner', () => {
  it('stays leased, is not reassigned, and can still be disposed of on purpose', async () => {
    const workspace = await newWorkspace();
    const target = await lease(workspace, 'loop-1-r1');
    await writeFile(path.join(target.worktreePath, 'feature.md'), 'done');
    await git(target.worktreePath, 'add', '.');
    await git(target.worktreePath, 'commit', '-m', 'feature');

    // The routine end-of-run return keeps committed work.
    const kept = await releaseWorktree(workspace, {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'recycle',
    });
    expect(kept.status).toBe('preserved');

    const state = JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
    const slot = state.slots.find((candidate) => candidate.slotId === target.slotId);
    expect(slot?.state).toBe('leased');
    expect(slot?.lease?.leaseId).toBe(target.leaseId);
    expect(slot?.reason).toContain('loop-1-r1');

    // A later run gets its own slot; the preserved one is not reassigned.
    const next = await acquireWorktree(workspace, { holder: 'loop-1-r2', title: 'Fix the parser' });
    expect(next.status).toBe('acquired');
    if (next.status !== 'acquired') return;
    expect(next.lease.slotId).not.toBe(target.slotId);
    expect(await exists(path.join(target.worktreePath, 'feature.md'))).toBe(true);

    // An explicitly authorised disposal still reaches it, and still leaves the
    // branch: removal was authorised, branch deletion was not.
    const removed = await releaseWorktree(workspace, {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'remove',
    });
    expect(removed.status).toBe('released');
    expect(await exists(target.worktreePath)).toBe(false);
    expect(await git(workspace, 'rev-parse', '--verify', `refs/heads/${target.branchName}`)).toBeTruthy();
  });

  it('answers a repeated preserve already-released without re-deciding', async () => {
    const workspace = await newWorkspace();
    const target = await lease(workspace, 'loop-2-r1');
    const request = {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'preserve' as const,
    };

    expect((await releaseWorktree(workspace, request)).status).toBe('preserved');
    expect((await releaseWorktree(workspace, request)).status).toBe('already-released');
  });

  it('answers an identical recycle retry without mutating pool state', async () => {
    const workspace = await newWorkspace();
    const target = await lease(workspace, 'loop-3-r1');
    await writeFile(path.join(target.worktreePath, 'feature.md'), 'done');
    await git(target.worktreePath, 'add', '.');
    await git(target.worktreePath, 'commit', '-m', 'feature');
    const request = {
      slotId: target.slotId,
      expectedLeaseId: target.leaseId,
      disposition: 'recycle' as const,
    };

    const first = await releaseWorktree(workspace, request);
    expect(first).toMatchObject({ status: 'preserved', checkout: 'retained' });
    const beforeRetry = await readFile(statePath(workspace), 'utf8');

    const retry = await releaseWorktree(workspace, request);

    expect(retry).toMatchObject({ status: 'already-released', checkout: 'retained' });
    expect(await readFile(statePath(workspace), 'utf8')).toBe(beforeRetry);
  });
});
