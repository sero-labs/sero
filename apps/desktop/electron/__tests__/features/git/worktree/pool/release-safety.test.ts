/**
 * A matching lease id is not a licence to delete.
 *
 * `openPool()` weighs every slot against Git registration and the filesystem
 * before a release is even considered. This suite holds the rule that the
 * verdict wins: a detached checkout, a changed branch, a locked or missing
 * registration, or a branch comparison Git could not answer all preserve the
 * checkout, for every disposition, however sound the caller's identity is.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Real Git against real repositories: each case spawns a dozen subprocesses,
// and the default 5s budget is a timing assertion nobody meant to write. It
// fires under full-suite parallelism and passes in isolation, which is the
// worst kind of failure to read.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import { releaseWorktree } from '@electron/features/git/worktree/pool/release';
import type {
  AppRuntimeReleaseWorktreeRequest,
  AppRuntimeWorktreeLease,
} from '@sero-ai/common';
import type { PoolState } from '@electron/features/git/worktree/pool/types';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function newWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-pool-rel-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  await execFileAsync('git', ['init', '-b', 'main', workspace]);
  await git(workspace, 'config', 'user.email', 'test@example.com');
  await git(workspace, 'config', 'user.name', 'Test');
  await writeFile(path.join(workspace, 'readme.md'), 'hello');
  await git(workspace, 'add', '.');
  await git(workspace, 'commit', '-m', 'init');
  return workspace;
}

async function leased(holder = 'loop-1-r1'): Promise<{ workspace: string; lease: AppRuntimeWorktreeLease }> {
  const workspace = await newWorkspace();
  const outcome = await acquireWorktree(workspace, { holder, title: 'Fix the parser' });
  if (outcome.status !== 'acquired') throw new Error(outcome.reason);
  return { workspace, lease: outcome.lease };
}

function statePath(workspace: string): string {
  return path.join(workspace, '.git', 'sero-worktree-pool', 'pool.json');
}

async function exists(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null)) !== null;
}

/** Every disposition that can dispose of a checkout. `preserve` never can. */
const DISPOSITIONS: AppRuntimeReleaseWorktreeRequest['disposition'][] = ['recycle', 'remove'];

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('a rejected slot is never released', () => {
  it('preserves a detached checkout under every disposition', async () => {
    for (const disposition of DISPOSITIONS) {
      const { workspace, lease } = await leased();
      await git(lease.worktreePath, 'checkout', '--detach');

      const outcome = await releaseWorktree(workspace, {
        slotId: lease.slotId,
        expectedLeaseId: lease.leaseId,
        disposition,
      });

      expect(outcome.status).toBe('recovery-required');
      expect(await exists(lease.worktreePath)).toBe(true);
    }
  });

  it('preserves a checkout that moved to another branch', async () => {
    for (const disposition of DISPOSITIONS) {
      const { workspace, lease } = await leased();
      await git(lease.worktreePath, 'checkout', '-b', 'feat/somewhere-else');

      const outcome = await releaseWorktree(workspace, {
        slotId: lease.slotId,
        expectedLeaseId: lease.leaseId,
        disposition,
      });

      expect(outcome.status).toBe('recovery-required');
      expect(outcome.reason).toContain('feat/somewhere-else');
      expect(await exists(lease.worktreePath)).toBe(true);
    }
  });

  it('preserves a worktree Git reports locked', async () => {
    for (const disposition of DISPOSITIONS) {
      const { workspace, lease } = await leased();
      await git(workspace, 'worktree', 'lock', '--reason', 'the installer is running', lease.worktreePath);

      const outcome = await releaseWorktree(workspace, {
        slotId: lease.slotId,
        expectedLeaseId: lease.leaseId,
        disposition,
      });

      expect(outcome.status).toBe('recovery-required');
      expect(outcome.reason).toContain('the installer is running');
      expect(await exists(lease.worktreePath)).toBe(true);
    }
  });

  it('preserves a directory Git no longer registers', async () => {
    for (const disposition of DISPOSITIONS) {
      const { workspace, lease } = await leased();
      await writeFile(path.join(lease.worktreePath, 'work.md'), 'hours of work');
      await rm(path.join(workspace, '.git', 'worktrees'), { recursive: true, force: true });

      const outcome = await releaseWorktree(workspace, {
        slotId: lease.slotId,
        expectedLeaseId: lease.leaseId,
        disposition,
      });

      expect(outcome.status).toBe('recovery-required');
      expect(await readFile(path.join(lease.worktreePath, 'work.md'), 'utf8')).toBe('hours of work');
    }
  });

  it('preserves a checkout whose branch comparison Git cannot answer', async () => {
    for (const disposition of DISPOSITIONS) {
      const { workspace, lease } = await leased();
      // The recorded base commit is no longer resolvable, so `rev-list` fails.
      // An answer Git could not give is not an answer that the work is spare.
      const raw = JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
      await writeFile(statePath(workspace), JSON.stringify({
        ...raw,
        slots: raw.slots.map((slot) => (slot.lease
          ? { ...slot, lease: { ...slot.lease, baseCommit: '0'.repeat(40) } }
          : slot)),
      }), 'utf8');

      const outcome = await releaseWorktree(workspace, {
        slotId: lease.slotId,
        expectedLeaseId: lease.leaseId,
        disposition,
      });

      expect(outcome.status).toBe('recovery-required');
      expect(outcome.reason).toContain('could not be compared');
      expect(await exists(lease.worktreePath)).toBe(true);
    }
  });
});

describe('a preserved checkout keeps its owner', () => {
  it('leaves the slot leased to the same holder, so no later acquisition can take it', async () => {
    const { workspace, lease } = await leased();
    await writeFile(path.join(lease.worktreePath, 'feature.md'), 'done');
    await git(lease.worktreePath, 'add', '.');
    await git(lease.worktreePath, 'commit', '-m', 'feature');

    const outcome = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'recycle',
    });
    expect(outcome.status).toBe('preserved');

    const state = JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
    const slot = state.slots.find((candidate) => candidate.slotId === lease.slotId);
    expect(slot?.state).toBe('leased');
    expect(slot?.lease?.leaseId).toBe(lease.leaseId);
    expect(slot?.lease?.leaseHolder).toBe('loop-1-r1');
    expect(slot?.reason).toContain('loop-1-r1');

    // A later run gets its own slot; the preserved one is not reassigned.
    const next = await acquireWorktree(workspace, { holder: 'loop-1-r2', title: 'Fix the parser' });
    expect(next.status).toBe('acquired');
    if (next.status !== 'acquired') return;
    expect(next.lease.slotId).not.toBe(lease.slotId);
    expect(await exists(path.join(lease.worktreePath, 'feature.md'))).toBe(true);
  });

  it('still lets an explicitly authorised remove dispose of it later', async () => {
    const { workspace, lease } = await leased();
    await writeFile(path.join(lease.worktreePath, 'feature.md'), 'done');
    await git(lease.worktreePath, 'add', '.');
    await git(lease.worktreePath, 'commit', '-m', 'feature');
    await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'recycle',
    });

    const outcome = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'remove',
    });

    expect(outcome.status).toBe('released');
    expect(await exists(lease.worktreePath)).toBe(false);
    // The branch survives: removal was authorised, branch deletion was not.
    expect(await git(workspace, 'rev-parse', '--verify', `refs/heads/${lease.branchName}`)).toBeTruthy();
  });

  it('answers a repeated preserve already-released without re-deciding', async () => {
    const { workspace, lease } = await leased();
    const first = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'preserve',
    });
    expect(first.status).toBe('preserved');

    const retry = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'preserve',
    });
    expect(retry.status).toBe('already-released');
  });
});
