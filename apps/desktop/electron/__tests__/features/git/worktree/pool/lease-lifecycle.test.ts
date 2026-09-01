/**
 * Lease lifecycle against real Git repositories — no mocks.
 *
 * The properties under test are the ones that decide whether work on disk
 * survives: a lease identity is never reused, a delayed release cannot act on
 * a newer lease, concurrent acquisitions never share a slot, and a checkout
 * that cannot be proved disposable is preserved.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import { releaseWorktree } from '@electron/features/git/worktree/pool/release';
import { reattachWorktree } from '@electron/features/git/worktree/pool/reattach';
import { openPool } from '@electron/features/git/worktree/pool/session';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

/** A workspace repository with one commit on `main`, and no remote. */
async function newWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-pool-'));
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

async function acquireOrThrow(workspace: string, holder: string, title = 'Fix the parser') {
  const outcome = await acquireWorktree(workspace, { holder, title });
  if (outcome.status !== 'acquired') throw new Error(`acquire blocked: ${outcome.reason}`);
  return outcome.lease;
}

async function exists(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null)) !== null;
}

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('acquisition', () => {
  it('creates a checkout on Sero\'s conventional branch and records an immutable lease', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-1-r1', 'Fix the parser');

    expect(lease.branchName).toBe('fix/fix-the-parser-loop-1-r1');
    expect(lease.branchKind).toBe('fresh-task');
    expect(await git(lease.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(lease.branchName);
    expect(lease.acquiredHead).toBe(await git(workspace, 'rev-parse', 'HEAD'));
    expect(path.basename(lease.worktreePath).startsWith('slot-')).toBe(true);
  });

  it('mints a different lease identity for every acquisition, including a reacquisition by the same holder', async () => {
    const workspace = await newWorkspace();
    const first = await acquireOrThrow(workspace, 'loop-1-r1');
    await releaseWorktree(workspace, {
      slotId: first.slotId,
      expectedLeaseId: first.leaseId,
      disposition: 'recycle',
    });
    const second = await acquireOrThrow(workspace, 'loop-1-r1');

    expect(second.leaseId).not.toBe(first.leaseId);
  });

  it('refuses a second checkout for a holder that already holds one', async () => {
    const workspace = await newWorkspace();
    await acquireOrThrow(workspace, 'loop-1-r1');
    const second = await acquireWorktree(workspace, { holder: 'loop-1-r1', title: 'Fix the parser' });

    expect(second.status).toBe('blocked');
    if (second.status !== 'blocked') return;
    expect(second.reason).toContain('Reattach');
  });

  it('never issues one slot twice under concurrent acquisition', async () => {
    const workspace = await newWorkspace();
    const holders = ['a-r1', 'b-r1', 'c-r1', 'd-r1', 'e-r1'];
    const outcomes = await Promise.all(
      holders.map((holder) => acquireWorktree(workspace, { holder, title: `Task ${holder}` })),
    );

    const leases = outcomes.flatMap((outcome) => (outcome.status === 'acquired' ? [outcome.lease] : []));
    expect(leases).toHaveLength(holders.length);
    expect(new Set(leases.map((lease) => lease.slotId)).size).toBe(holders.length);
    expect(new Set(leases.map((lease) => lease.leaseId)).size).toBe(holders.length);
    expect(new Set(leases.map((lease) => lease.worktreePath)).size).toBe(holders.length);

    const opened = await openPool(workspace);
    expect(opened.status).toBe('ok');
    if (opened.status !== 'ok') return;
    expect(opened.session.state.slots.filter((slot) => slot.state === 'leased')).toHaveLength(holders.length);
  });

  it('bootstraps a greenfield directory rather than refusing it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-pool-green-'));
    roots.push(root);
    const lease = await acquireOrThrow(root, 'loop-9-r1', 'Start something');

    expect(lease.greenfield).toBe(true);
    expect(await git(lease.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(lease.branchName);
  });
});

describe('release fencing', () => {
  it('answers a retry already-released and a delayed older release stale-lease', async () => {
    const workspace = await newWorkspace();
    const first = await acquireOrThrow(workspace, 'loop-1-r1');

    const released = await releaseWorktree(workspace, {
      slotId: first.slotId,
      expectedLeaseId: first.leaseId,
      disposition: 'recycle',
    });
    expect(released.status).toBe('released');

    const retry = await releaseWorktree(workspace, {
      slotId: first.slotId,
      expectedLeaseId: first.leaseId,
      disposition: 'recycle',
    });
    expect(retry.status).toBe('already-released');

    // A second holder takes a slot, then the first holder's cleanup arrives late.
    const second = await acquireOrThrow(workspace, 'loop-2-r1');
    const delayed = await releaseWorktree(workspace, {
      slotId: second.slotId,
      expectedLeaseId: first.leaseId,
      disposition: 'recycle',
    });
    expect(delayed.status).toBe('stale-lease');
    expect(await exists(second.worktreePath)).toBe(true);
    expect(await git(second.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(second.branchName);
  });

  it('preserves a checkout that holds uncommitted work, whatever the caller asked for', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-3-r1');
    await writeFile(path.join(lease.worktreePath, 'scratch.md'), 'work in progress');

    const outcome = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'remove',
    });

    expect(outcome.status).toBe('preserved');
    expect(outcome.reason).toContain('uncommitted');
    expect(await exists(path.join(lease.worktreePath, 'scratch.md'))).toBe(true);
  });

  it('preserves a checkout whose branch holds commits the base does not', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-4-r1');
    await writeFile(path.join(lease.worktreePath, 'feature.md'), 'done');
    await git(lease.worktreePath, 'add', '.');
    await git(lease.worktreePath, 'commit', '-m', 'feature');

    const outcome = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'recycle',
      deleteMergedBranch: true,
    });

    expect(outcome.status).toBe('preserved');
    expect(await exists(lease.worktreePath)).toBe(true);
    expect(await git(workspace, 'rev-parse', '--verify', `refs/heads/${lease.branchName}`)).toBeTruthy();
  });

  it('removes a clean no-op checkout and deletes only its merged local branch', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-5-r1');

    const outcome = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'recycle',
      deleteMergedBranch: true,
    });

    expect(outcome.status).toBe('released');
    expect(await exists(lease.worktreePath)).toBe(false);
    await expect(git(workspace, 'rev-parse', '--verify', `refs/heads/${lease.branchName}`)).rejects.toThrow();
  });

  it('keeps the checkout when the caller asks to preserve it', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-6-r1');

    const outcome = await releaseWorktree(workspace, {
      slotId: lease.slotId,
      expectedLeaseId: lease.leaseId,
      disposition: 'preserve',
    });

    expect(outcome.status).toBe('preserved');
    expect(await exists(lease.worktreePath)).toBe(true);
  });
});

describe('reattachment', () => {
  it('attaches a live lease and refuses every disagreement', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-7-r1');

    const attached = await reattachWorktree(workspace, {
      kind: 'lease',
      holder: 'loop-7-r1',
      slotId: lease.slotId,
      leaseId: lease.leaseId,
    });
    expect(attached.status).toBe('attached');

    const wrongLease = await reattachWorktree(workspace, {
      kind: 'lease',
      holder: 'loop-7-r1',
      slotId: lease.slotId,
      leaseId: 'not-the-lease',
    });
    expect(wrongLease.status).toBe('recovery-required');

    const wrongHolder = await reattachWorktree(workspace, {
      kind: 'lease',
      holder: 'someone-else',
      slotId: lease.slotId,
      leaseId: lease.leaseId,
    });
    expect(wrongHolder.status).toBe('recovery-required');

    const wrongSlot = await reattachWorktree(workspace, {
      kind: 'lease',
      holder: 'loop-7-r1',
      slotId: 'slot-does-not-exist',
      leaseId: lease.leaseId,
    });
    expect(wrongSlot.status).toBe('recovery-required');
  });

  it('refuses a lease whose checkout Git no longer registers, and preserves the directory', async () => {
    const workspace = await newWorkspace();
    const lease = await acquireOrThrow(workspace, 'loop-8-r1');
    // Git forgets the worktree; the directory and its work stay on disk.
    await rm(path.join(workspace, '.git', 'worktrees'), { recursive: true, force: true });

    const outcome = await reattachWorktree(workspace, {
      kind: 'lease',
      holder: 'loop-8-r1',
      slotId: lease.slotId,
      leaseId: lease.leaseId,
    });

    expect(outcome.status).toBe('recovery-required');
    expect(await exists(lease.worktreePath)).toBe(true);
  });
});

describe('legacy card-* checkouts', () => {
  it('adopts one matched to its persisted owner, and marks an unmatched one recovery-required', async () => {
    const workspace = await newWorkspace();
    const legacyPath = path.join(workspace, '.sero', 'worktrees', 'card-loop-legacy-r1');
    await execFileAsync('git', ['worktree', 'add', '-b', 'feat/legacy', legacyPath], { cwd: workspace });

    // Before any owner is proved, reconciliation adopts it as recovery-required.
    const opened = await openPool(workspace);
    expect(opened.status).toBe('ok');
    if (opened.status !== 'ok') return;
    const adopted = opened.session.state.slots.find((slot) => slot.legacy);
    expect(adopted?.state).toBe('recovery-required');

    const wrongBranch = await reattachWorktree(workspace, {
      kind: 'legacy',
      holder: 'loop-legacy-r1',
      worktreePath: legacyPath,
      branchName: 'feat/not-this-one',
    });
    expect(wrongBranch.status).toBe('recovery-required');

    const matched = await reattachWorktree(workspace, {
      kind: 'legacy',
      holder: 'loop-legacy-r1',
      worktreePath: legacyPath,
      branchName: 'feat/legacy',
    });
    expect(matched.status).toBe('attached');
    if (matched.status !== 'attached') return;
    expect(matched.lease.worktreePath).toBe(await git(legacyPath, 'rev-parse', '--show-toplevel'));
    // Provenance is unknown, so the migration lease is labelled the way that
    // makes cleanup refuse to delete the branch.
    expect(matched.lease.branchKind).toBe('external-pr');
  });

  it('refuses to adopt a directory outside the workspace pool root', async () => {
    const workspace = await newWorkspace();
    const outside = path.join(path.dirname(workspace), 'elsewhere');
    await execFileAsync('git', ['worktree', 'add', '-b', 'feat/outside', outside], { cwd: workspace });

    const outcome = await reattachWorktree(workspace, {
      kind: 'legacy',
      holder: 'loop-outside-r1',
      worktreePath: outside,
    });

    expect(outcome.status).toBe('recovery-required');
    expect(await readdir(outside)).toContain('readme.md');
  });
});

describe('failed provisioning', () => {
  it('records no phantom slot when nothing reached the filesystem', async () => {
    const workspace = await newWorkspace();
    // A branch name Git will refuse: acquisition fails before any checkout exists.
    const outcome = await acquireWorktree(workspace, { holder: 'loop-x-r1', title: 'Task', existingBranch: 'a..b' });
    expect(outcome.status).toBe('blocked');

    const opened = await openPool(workspace);
    if (opened.status !== 'ok') throw new Error(opened.reason);
    expect(opened.session.state.slots).toEqual([]);
  });
});
