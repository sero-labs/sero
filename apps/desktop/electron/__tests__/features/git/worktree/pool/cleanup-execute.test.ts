import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import {
  executeWorktreeCleanupPlan,
  type CleanupFaultPoint,
} from '@electron/features/git/worktree/pool/cleanup-execute';
import { CleanupPlanStore, createWorktreeCleanupPlan } from '@electron/features/git/worktree/pool/cleanup-plans';
import { WorktreeProcessGuard, type ProcessDetectionResult } from '@electron/features/git/worktree/pool/process-guard';
import { releaseWorktree } from '@electron/features/git/worktree/pool/release';
import type { PoolState } from '@electron/features/git/worktree/pool/types';
import type { AppRuntimeWorktreeCleanupPlan, AppRuntimeWorktreeLease } from '@sero-ai/common';
import { git, newWorkspaceRepo, removeWorkspaceRepos } from '../worktree-test-helpers';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

function guard(detect: (root: string) => Promise<ProcessDetectionResult> = async () => ({ status: 'clear' })) {
  return new WorktreeProcessGuard({ detector: { platform: 'linux', detect } });
}

const clearGuard = guard();

async function acquire(
  workspace: string,
  holder: string,
  existingBranch?: string,
): Promise<AppRuntimeWorktreeLease> {
  const result = await acquireWorktree(
    workspace,
    { holder, title: 'Confirmed cleanup', existingBranch },
    { processGuard: clearGuard },
  );
  if (result.status !== 'acquired') throw new Error(result.reason);
  return result.lease;
}

async function makeIdle(workspace: string, lease: AppRuntimeWorktreeLease): Promise<void> {
  const result = await releaseWorktree(workspace, {
    slotId: lease.slotId,
    expectedLeaseId: lease.leaseId,
    disposition: 'recycle',
  }, { processGuard: clearGuard, retainedIdleCapacity: 20 });
  if (result.status !== 'released') throw new Error(result.reason);
}

async function plan(
  workspace: string,
  plans: CleanupPlanStore,
  processGuard: WorktreeProcessGuard = clearGuard,
): Promise<AppRuntimeWorktreeCleanupPlan> {
  const result = await createWorktreeCleanupPlan(workspace, { plans, processGuard });
  if (result.status !== 'planned') throw new Error(result.reason);
  return result.plan;
}

function statePath(workspace: string): string {
  return path.join(workspace, '.git', 'sero-worktree-pool', 'pool.json');
}

async function state(workspace: string): Promise<PoolState> {
  return JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
}

async function exists(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null)) !== null;
}

afterAll(removeWorkspaceRepos);

describe('confirmed cleanup execution', () => {
  it('removes only a still-proved idle slot and preserves active, dirty, unmerged and external-PR work', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-exec-');
    await git(workspace, 'branch', 'contributor/pr', 'main');
    const idle = await acquire(workspace, 'idle');
    const dirty = await acquire(workspace, 'dirty');
    const unmerged = await acquire(workspace, 'unmerged');
    const external = await acquire(workspace, 'external', 'contributor/pr');
    await makeIdle(workspace, idle);
    await writeFile(path.join(dirty.worktreePath, 'dirty.txt'), 'unfinished');
    await writeFile(path.join(unmerged.worktreePath, 'feature.txt'), 'committed work');
    await git(unmerged.worktreePath, 'add', '.');
    await git(unmerged.worktreePath, 'commit', '-m', 'feature');

    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans);
    const result = await executeWorktreeCleanupPlan(workspace, cleanup.planId, { plans, processGuard: clearGuard });

    expect(result.status).toBe('executed');
    if (result.status !== 'executed') return;
    expect(result.results.find((entry) => entry.slotId === idle.slotId)?.outcome).toBe('removed');
    expect(result.results.filter((entry) => entry.slotId !== idle.slotId).every((entry) => entry.outcome === 'preserved')).toBe(true);
    expect(await exists(idle.worktreePath)).toBe(false);
    expect(await readFile(path.join(dirty.worktreePath, 'dirty.txt'), 'utf8')).toBe('unfinished');
    expect(await readFile(path.join(unmerged.worktreePath, 'feature.txt'), 'utf8')).toBe('committed work');
    expect(await git(workspace, 'rev-parse', '--verify', 'refs/heads/contributor/pr')).toBeTruthy();
  });

  it('cannot affect a slot that was reused with a new lease after planning', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-aba-');
    const old = await acquire(workspace, 'old');
    await makeIdle(workspace, old);
    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans);
    const current = await acquire(workspace, 'new');
    expect(current.slotId).toBe(old.slotId);
    expect(current.leaseId).not.toBe(old.leaseId);

    const result = await executeWorktreeCleanupPlan(workspace, cleanup.planId, { plans, processGuard: clearGuard });
    expect(result).toMatchObject({
      status: 'executed',
      results: [{ outcome: 'skipped-stale', slotId: old.slotId }],
    });
    expect(await git(current.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(current.branchName);
  });

  it('blocks branch, HEAD, path, registration, process and classification drift per slot', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-drift-');
    const leases = await Promise.all(['branch', 'head', 'path', 'registration', 'process', 'classification']
      .map((holder) => acquire(workspace, holder)));
    for (const lease of leases) await makeIdle(workspace, lease);
    const inUse = new Set<string>();
    const processGuard = guard(async (root) => inUse.has(root)
      ? { status: 'in-use', processes: [{ pid: 77, command: 'foreign' }] }
      : { status: 'clear' });
    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans, processGuard);
    const [branch, head, moved, registration, processLease, classification] = leases;

    await git(branch.worktreePath, 'switch', '-c', 'drift/branch');
    await git(workspace, 'commit', '--allow-empty', '-m', 'advance main');
    await git(head.worktreePath, 'reset', '--hard', 'main');
    await git(workspace, 'worktree', 'lock', '--reason', 'drifted lock', registration.worktreePath);
    inUse.add(processLease.worktreePath);
    await writeFile(path.join(classification.worktreePath, 'new.txt'), 'drift');
    const raw = await state(workspace);
    await writeFile(statePath(workspace), JSON.stringify({
      ...raw,
      slots: raw.slots.map((slot) => slot.slotId === moved.slotId
        ? { ...slot, path: path.join(workspace, '.sero', 'worktrees', 'moved-after-plan') }
        : slot),
    }), 'utf8');

    const result = await executeWorktreeCleanupPlan(workspace, cleanup.planId, { plans, processGuard });
    expect(result.status).toBe('executed');
    if (result.status !== 'executed') return;
    expect(result.results).toHaveLength(leases.length);
    expect(result.results.every((entry) => entry.outcome === 'skipped-stale')).toBe(true);
    expect(await exists(branch.worktreePath)).toBe(true);
    expect(await exists(head.worktreePath)).toBe(true);
    expect(await exists(registration.worktreePath)).toBe(true);
    expect(await exists(processLease.worktreePath)).toBe(true);
  });

  it('keeps checkout contents and pool evidence when exact-path Git removal fails', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-fail-');
    const idle = await acquire(workspace, 'failure');
    await makeIdle(workspace, idle);
    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans);

    const result = await executeWorktreeCleanupPlan(workspace, cleanup.planId, {
      plans,
      processGuard: clearGuard,
      removeWorktree: async () => ({ status: 'preserved', detail: 'injected Git refusal' }),
    });

    expect(result).toMatchObject({ status: 'executed', results: [{ outcome: 'failed' }] });
    expect(await readFile(path.join(idle.worktreePath, 'readme.md'), 'utf8')).toBe('hello');
    const persisted = await state(workspace);
    expect(persisted.slots.find((slot) => slot.slotId === idle.slotId)).toMatchObject({
      state: 'recovery-required',
      path: idle.worktreePath,
    });
  });

  it('persists an earlier slot before a later confirmed action is interrupted', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-partial-');
    const first = await acquire(workspace, 'first');
    const second = await acquire(workspace, 'second');
    await makeIdle(workspace, first);
    await makeIdle(workspace, second);
    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans);

    await expect(executeWorktreeCleanupPlan(workspace, cleanup.planId, {
      plans,
      processGuard: clearGuard,
      fault: (point, slotId) => {
        if (point === 'after-slot-commit' && slotId === first.slotId) throw new Error('crash after first');
      },
    })).rejects.toThrow('crash after first');

    const persisted = await state(workspace);
    expect(persisted.slots.some((slot) => slot.slotId === first.slotId)).toBe(false);
    expect(persisted.slots.find((slot) => slot.slotId === second.slotId)?.state).toBe('available');
    expect(await exists(first.worktreePath)).toBe(false);
    expect(await exists(second.worktreePath)).toBe(true);
    expect(plans.consume(cleanup.planId, new Date()).status).toBe('unknown');
  });
});

describe('cleanup crash fences', () => {
  it('never exposes a reserved or physically processed slot as available at any fault point', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-crash-');
    const points: CleanupFaultPoint[] = [
      'after-confirmation',
      'after-reservation',
      'after-process-shutdown',
      'before-git-operation',
      'after-physical-success',
      'after-slot-commit',
    ];
    for (const point of points) {
      const lease = await acquire(workspace, point);
      await makeIdle(workspace, lease);
      const plans = new CleanupPlanStore();
      const cleanup = await plan(workspace, plans);
      await expect(executeWorktreeCleanupPlan(workspace, cleanup.planId, {
        plans,
        processGuard: clearGuard,
        fault: (at, slotId) => {
          if (at === point && (slotId === undefined || slotId === lease.slotId)) throw new Error(`crash at ${point}`);
        },
      })).rejects.toThrow(`crash at ${point}`);

      const persisted = await state(workspace);
      const slot = persisted.slots.find((candidate) => candidate.slotId === lease.slotId);
      if (point === 'after-confirmation') expect(slot?.state).toBe('available');
      else if (point === 'after-slot-commit') expect(slot).toBeUndefined();
      else expect(slot?.state).toBe('removing');
    }
  });

  it('leaves an exact reservation when the process stops during Git removal', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-git-crash-');
    const lease = await acquire(workspace, 'git-crash');
    await makeIdle(workspace, lease);
    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans);

    await expect(executeWorktreeCleanupPlan(workspace, cleanup.planId, {
      plans,
      processGuard: clearGuard,
      removeWorktree: async () => { throw new Error('process stopped during Git removal'); },
    })).rejects.toThrow('process stopped during Git removal');

    expect((await state(workspace)).slots.find((slot) => slot.slotId === lease.slotId)).toMatchObject({
      state: 'removing',
      path: lease.worktreePath,
      operation: { leaseId: null },
    });
    expect(await exists(lease.worktreePath)).toBe(true);
  });
});

describe('exact classified recovery', () => {
  it('repairs only absent, unleased records and exact missing-checkout registrations', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-repair-');
    const staleRecord = await acquire(workspace, 'record');
    const staleRegistration = await acquire(workspace, 'registration');
    await makeIdle(workspace, staleRecord);
    await makeIdle(workspace, staleRegistration);
    await git(workspace, 'worktree', 'remove', staleRecord.worktreePath);
    await rm(staleRegistration.worktreePath, { recursive: true, force: true });
    const raw = await state(workspace);
    await writeFile(statePath(workspace), JSON.stringify({
      ...raw,
      slots: raw.slots.map((slot) => ({
        ...slot,
        state: 'orphaned',
        reason: 'The checkout is absent and requires exact recovery.',
      })),
    }), 'utf8');
    const plans = new CleanupPlanStore();
    const cleanup = await plan(workspace, plans);
    expect(cleanup.slots.map((slot) => slot.action)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'repair', recovery: 'drop-absent-slot-record' }),
      expect.objectContaining({ kind: 'repair', recovery: 'remove-missing-checkout-registration' }),
    ]));

    const result = await executeWorktreeCleanupPlan(workspace, cleanup.planId, { plans, processGuard: clearGuard });
    expect(result.status).toBe('executed');
    if (result.status !== 'executed') return;
    expect(result.results.every((entry) => entry.outcome === 'repaired')).toBe(true);
    expect((await state(workspace)).slots).toHaveLength(0);
  });
});
