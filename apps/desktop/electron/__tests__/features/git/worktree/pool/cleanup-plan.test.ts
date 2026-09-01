import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import { getWorktreePoolStatus } from '@electron/features/git/worktree/pool/cleanup-inspection';
import { CleanupPlanStore, createWorktreeCleanupPlan } from '@electron/features/git/worktree/pool/cleanup-plans';
import { WorktreeProcessGuard } from '@electron/features/git/worktree/pool/process-guard';
import { releaseWorktree } from '@electron/features/git/worktree/pool/release';
import type { PoolState, SlotState } from '@electron/features/git/worktree/pool/types';
import type { AppRuntimeWorktreeLease } from '@sero-ai/common';
import { git, newWorkspaceRepo, removeWorkspaceRepos } from '../worktree-test-helpers';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const clearGuard = new WorktreeProcessGuard({
  detector: { platform: 'linux', detect: async () => ({ status: 'clear' }) },
});

async function acquire(workspace: string, holder: string): Promise<AppRuntimeWorktreeLease> {
  const result = await acquireWorktree(workspace, { holder, title: 'Cleanup plan' }, { processGuard: clearGuard });
  if (result.status !== 'acquired') throw new Error(result.reason);
  return result.lease;
}

async function makeIdle(workspace: string, lease: AppRuntimeWorktreeLease): Promise<void> {
  const result = await releaseWorktree(workspace, {
    slotId: lease.slotId,
    expectedLeaseId: lease.leaseId,
    disposition: 'recycle',
  }, { processGuard: clearGuard, retainedIdleCapacity: 8 });
  if (result.status !== 'released') throw new Error(result.reason);
}

function statePath(workspace: string): string {
  return path.join(workspace, '.git', 'sero-worktree-pool', 'pool.json');
}

afterAll(removeWorkspaceRepos);

describe('read-only cleanup planning', () => {
  it('does not mutate pool, Git registration or filesystem state and explains every slot', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-plan-');
    const idle = await acquire(workspace, 'idle');
    const dirty = await acquire(workspace, 'dirty');
    await makeIdle(workspace, idle);
    await writeFile(path.join(dirty.worktreePath, 'unfinished.txt'), 'do not lose');

    const beforeState = await readFile(statePath(workspace), 'utf8');
    const beforeRegistrations = await git(workspace, 'worktree', 'list', '--porcelain');
    const beforeDirty = await readFile(path.join(dirty.worktreePath, 'unfinished.txt'), 'utf8');
    const plans = new CleanupPlanStore(60_000, () => 'host-plan');

    const status = await getWorktreePoolStatus(workspace, { processGuard: clearGuard });
    const planned = await createWorktreeCleanupPlan(workspace, { processGuard: clearGuard, plans });

    expect(status.status).toBe('ok');
    expect(planned.status).toBe('planned');
    if (status.status !== 'ok' || planned.status !== 'planned') return;
    expect(planned.plan).toMatchObject({
      planId: 'host-plan',
      poolRevision: status.pool.revision,
      repositoryId: status.pool.repositoryId,
    });
    expect(planned.plan.slots).toHaveLength(2);
    expect(planned.plan.slots.every((slot) => slot.reason.length > 0)).toBe(true);
    expect(planned.plan.slots.find((slot) => slot.slotId === idle.slotId)?.action.kind).toBe('remove');
    expect(planned.plan.slots.find((slot) => slot.slotId === dirty.slotId)?.action.kind).toBe('preserve');
    expect(planned.plan.slots.find((slot) => slot.slotId === dirty.slotId)?.fingerprint.cleanliness).toBe('dirty');

    expect(await readFile(statePath(workspace), 'utf8')).toBe(beforeState);
    expect(await git(workspace, 'worktree', 'list', '--porcelain')).toBe(beforeRegistrations);
    expect(await readFile(path.join(dirty.worktreePath, 'unfinished.txt'), 'utf8')).toBe(beforeDirty);
    expect(await stat(idle.worktreePath)).toBeTruthy();
  });

  it('observes independent slots concurrently without serialising read-only inspection', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-read-');
    const leases = await Promise.all([acquire(workspace, 'one'), acquire(workspace, 'two')]);
    let active = 0;
    let peak = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const detector = new WorktreeProcessGuard({
      detector: {
        platform: 'linux',
        detect: async () => {
          active += 1;
          peak = Math.max(peak, active);
          if (active === leases.length) release();
          await gate;
          active -= 1;
          return { status: 'clear' };
        },
      },
    });

    const result = await getWorktreePoolStatus(workspace, { processGuard: detector });
    expect(result.status).toBe('ok');
    expect(peak).toBe(2);
  });

  it('preserves every unsafe or unverifiable classification without exact recovery proof', async () => {
    const { workspace } = await newWorkspaceRepo('sero-clean-preserve-');
    const states: SlotState[] = ['dirty', 'unmerged', 'damaged', 'orphaned', 'recovery-required'];
    const leases = await Promise.all([...states.map(String), 'in-use', 'unverifiable']
      .map((holder) => acquire(workspace, holder)));
    for (const lease of leases) await makeIdle(workspace, lease);
    const raw = JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
    await writeFile(statePath(workspace), JSON.stringify({
      ...raw,
      slots: raw.slots.map((slot) => {
        const index = leases.findIndex((lease) => lease.slotId === slot.slotId);
        return index >= 0 && index < states.length
          ? { ...slot, state: states[index], reason: `Test ${states[index]} evidence.` }
          : slot;
      }),
    }), 'utf8');
    const inUsePath = leases[states.length].worktreePath;
    const unverifiablePath = leases[states.length + 1].worktreePath;
    const processGuard = new WorktreeProcessGuard({
      detector: {
        platform: 'linux',
        detect: async (root) => {
          if (root === inUsePath) {
            return { status: 'in-use', processes: [{ pid: 99, command: 'foreign' }] };
          }
          if (root === unverifiablePath) return { status: 'unverifiable', reason: 'permission denied' };
          return { status: 'clear' };
        },
      },
    });

    const result = await createWorktreeCleanupPlan(workspace, {
      plans: new CleanupPlanStore(),
      processGuard,
    });
    expect(result.status).toBe('planned');
    if (result.status !== 'planned') return;
    expect(result.plan.slots).toHaveLength(leases.length);
    expect(result.plan.slots.every((slot) => slot.action.kind === 'preserve')).toBe(true);
    expect(result.plan.slots.find((slot) => slot.path === inUsePath)?.fingerprint.process).toBe('in-use');
    expect(result.plan.slots.find((slot) => slot.path === unverifiablePath)?.fingerprint.process)
      .toBe('unverifiable');
  });
});
