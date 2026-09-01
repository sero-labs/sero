import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { ResolvedWorkspaceContext, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeDecider, fakeExecutor, gatedExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };

/** Polls until `cond` holds (or fails after a bounded number of macrotasks). */
async function waitFor(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('waitFor timed out');
}

function coordinatorWith(host: FakeHost, partial: Partial<EngineDeps>): Coordinator {
  const deps: EngineDeps = {
    executor: partial.executor ?? fakeExecutor({}),
    decider: partial.decider ?? fakeDecider({ decision: 'wait' }),
    locks: partial.locks ?? new LoopLocks(),
  };
  return new Coordinator(host, deps);
}

describe('Coordinator core (Phase 3)', () => {
  it('run_next drives a coordinator run through the engine', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const coordinator = coordinatorWith(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });
    const res = await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('two concurrent run_next requests run each step once', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const { executor, release } = gatedExecutor(SUCCESS);
    const coordinator = coordinatorWith(host, { executor });
    const a = coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const b = coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    release();
    await Promise.all([a, b]);
    expect(executor.calls).toEqual(['step-1']);
  });

  it('keeps the in-flight abort handle so disable cancels the running step despite a concurrent run_next', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const { executor, release } = gatedExecutor(SUCCESS);
    const coordinator = coordinatorWith(host, { executor });

    const first = coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    await waitFor(() => executor.calls.length === 1); // first run is mid-step

    // A concurrent run_next must not replace the in-flight run's abort handle…
    const second = await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(second.ok).toBe(true);
    // …so disable still aborts the run that is actually executing.
    await coordinator.requestAction({ kind: 'disable', loopId: 'loop-1' });
    release();
    await Promise.all([first, second]);

    const loop = host.state.loops[0];
    expect(loop.status).toBe('disabled');
    // Cancelled (not completed) — the abort reached the right run — and reset to
    // pending so re-enabling runs it again without an app restart.
    expect(loop.runtime.stepStates['step-1'].status).toBe('pending');
    expect(executor.calls).toEqual(['step-1']); // no second engine run started
  });

  it('blocks the loop with a clear reason on invalid runtime state', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    delete loop.runtime.stepStates['step-1'];
    host.state = { ...host.state, loops: [loop] };
    const coordinator = coordinatorWith(host, {});
    await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const blocked = host.state.loops[0];
    expect(blocked.status).toBe('blocked');
    expect(blocked.runtime.block?.kind).toBe('runtime-error');
    expect(blocked.runtime.block?.reason).toContain('missing runtime state');
  });
});

describe('Coordinator set_loop_context', () => {
  it('stores a user context override on the loop', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const overrides = { systemPrompt: 'Be terse.', disabledTools: ['bash'], disabledSkills: ['secret'] };
    const res = await new Coordinator(host).requestAction({ kind: 'set_loop_context', loopId: 'loop-1', overrides });
    expect(res.ok).toBe(true);
    expect(res.loop?.contextOverrides).toEqual(overrides);
    expect(host.state.loops[0].contextOverrides).toEqual(overrides);
  });

  it('clears the override when passed null', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.contextOverrides = { systemPrompt: 'Be terse.' };
    host.state = { ...host.state, loops: [loop] };
    const res = await new Coordinator(host).requestAction({ kind: 'set_loop_context', loopId: 'loop-1', overrides: null });
    expect(res.ok).toBe(true);
    expect(res.loop?.contextOverrides).toBeUndefined();
    expect(host.state.loops[0].contextOverrides).toBeUndefined();
  });

  it('errors for an unknown loop', async () => {
    const host = createFakeHost();
    const res = await new Coordinator(host).requestAction({ kind: 'set_loop_context', loopId: 'nope', overrides: null });
    expect(res.ok).toBe(false);
  });
});

describe('Coordinator set_delivery', () => {
  it('stores the delivery setting on the loop', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const delivery = { destination: 'chat-post' as const, params: { channel: '#intel' } };
    const res = await new Coordinator(host).requestAction({ kind: 'set_delivery', loopId: 'loop-1', delivery });
    expect(res.ok).toBe(true);
    expect(res.loop?.delivery).toEqual(delivery);
    expect(host.state.loops[0].delivery).toEqual(delivery);
  });

  it('rejects an unknown destination', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).requestAction({
      kind: 'set_delivery', loopId: 'loop-1', delivery: { destination: 'carrier-pigeon' as never },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('carrier-pigeon');
    expect(host.state.loops[0].delivery).toEqual({ destination: 'workspace-files' }); // fixture value, unchanged
  });

  it('rejects a webhook-post delivery without its url', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).requestAction({
      kind: 'set_delivery', loopId: 'loop-1', delivery: { destination: 'webhook-post' },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('"url"');
    expect(host.state.loops[0].delivery).toEqual({ destination: 'workspace-files' }); // fixture value, unchanged
  });

  it('rejects create options carrying an invalid delivery', async () => {
    const host = createFakeHost();
    const res = await new Coordinator(host).requestAction({
      kind: 'create', prompt: 'do it', options: { delivery: { destination: 'nope' as never } },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('nope');
    expect(host.state.loops).toHaveLength(0);
  });

  it('errors for an unknown loop', async () => {
    const host = createFakeHost();
    const res = await new Coordinator(host).requestAction({ kind: 'set_delivery', loopId: 'nope', delivery: { destination: 'pr' } });
    expect(res.ok).toBe(false);
  });
});

describe('Coordinator delete', () => {
  /**
   * A managed context carrying the lease its checkout is actually held under.
   * `worktreeKey` alone is not a release fence, so a context without a lease
   * identity is never released — see the pre-pool case below.
   */
  async function leaseManagedWorktree(
    host: ReturnType<typeof createFakeHost>,
    extra: Partial<ResolvedWorkspaceContext> = {},
  ): Promise<ResolvedWorkspaceContext> {
    const outcome = await host.acquireWorktree({ holder: 'loop-1', title: 'Task' });
    if (outcome.status !== 'acquired') throw new Error(outcome.reason);
    return {
      id: 'ws', type: 'managed-worktree', workspaceRoot: '/root',
      cwd: outcome.lease.worktreePath, worktreePath: outcome.lease.worktreePath,
      branchName: outcome.lease.branchName, worktreeKey: 'loop-1',
      slotId: outcome.lease.slotId, leaseId: outcome.lease.leaseId,
      resolvedBy: 'create-option', createdAt: 't', ...extra,
    };
  }

  it('removes the loop from state', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });
    expect(res.ok).toBe(true);
    expect(host.state.loops).toHaveLength(0);
  });

  it('releases a resolved managed worktree on delete, keeping the branch by default', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runtime.workspace.resolved = await leaseManagedWorktree(host);
    host.state = { ...host.state, loops: [loop] };
    await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });
    expect(host.worktreesRemoved).toContain('loop-1');
    expect(host.worktreeRemovals[0]).toMatchObject({
      loopId: 'loop-1', disposition: 'remove', deleteBranch: undefined,
    });
    expect(host.state.loops).toHaveLength(0);
  });

  it('deletes the local branch too when deleteBranch is set', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runtime.workspace.resolved = await leaseManagedWorktree(host);
    host.state = { ...host.state, loops: [loop] };
    await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1', deleteBranch: true });
    expect(host.worktreeRemovals[0]).toMatchObject({ loopId: 'loop-1', deleteBranch: true });
  });

  it('never deletes an event-pr worktree branch — it belongs to the PR (spec 15)', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runtime.workspace.resolved = await leaseManagedWorktree(host, {
      branchName: 'feat/someones-pr', externalBranch: true,
    });
    host.state = { ...host.state, loops: [loop] };
    await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1', deleteBranch: true });
    expect(host.worktreeRemovals[0]).toMatchObject({ loopId: 'loop-1', deleteBranch: undefined });
  });

  it('leaves a pre-pool checkout alone: a logical key is not a release fence', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runtime.workspace.resolved = {
      id: 'ws', type: 'managed-worktree', workspaceRoot: '/root',
      cwd: '/root/.sero/worktrees/card-loop-1', worktreePath: '/root/.sero/worktrees/card-loop-1',
      branchName: 'orchestrator/loop-1', worktreeKey: 'loop-1',
      resolvedBy: 'create-option', createdAt: 't',
    };
    host.state = { ...host.state, loops: [loop] };
    const result = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1', deleteBranch: true });
    expect(host.worktreeRemovals).toEqual([]);
    expect(result.ok).toBe(false);
    expect(host.state.loops).toHaveLength(1);
  });

  it('releases every preserved checkout before deleting the loop', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await leaseManagedWorktree(host);
    const second = await host.acquireWorktree({ holder: 'loop-1-r2', title: 'Task' });
    if (second.status !== 'acquired') throw new Error(second.reason);
    loop.runtime.workspace.resolved = first;
    loop.runtime.workspace.preservedWorktrees = [{
      slotId: second.lease.slotId,
      leaseId: second.lease.leaseId,
      worktreeKey: second.lease.leaseHolder,
      worktreePath: second.lease.worktreePath,
      branchName: second.lease.branchName,
      outcome: 'preserved',
      reason: 'The branch holds work.',
      at: 't',
    }];
    host.state = { ...host.state, loops: [loop] };

    const result = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });

    expect(result.ok).toBe(true);
    expect(host.worktreeRemovals.map((entry) => entry.leaseId)).toEqual([
      first.leaseId,
      second.lease.leaseId,
    ]);
    expect(host.state.loops).toHaveLength(0);
  });

  it('keeps refused preserved leases recoverable when deletion is retried', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await leaseManagedWorktree(host);
    const second = await host.acquireWorktree({ holder: 'loop-1-r2', title: 'Task' });
    if (second.status !== 'acquired') throw new Error(second.reason);
    loop.runtime.workspace.resolved = first;
    loop.runtime.workspace.preservedWorktrees = [{
      slotId: second.lease.slotId,
      leaseId: second.lease.leaseId,
      worktreeKey: second.lease.leaseHolder,
      worktreePath: second.lease.worktreePath,
      branchName: second.lease.branchName,
      outcome: 'preserved',
      reason: 'The branch holds work.',
      at: 't',
    }];
    host.releaseOutcomes.set(second.lease.leaseId, {
      status: 'preserved',
      slotId: second.lease.slotId,
      reason: 'The checkout has uncommitted work.',
      checkout: 'retained',
    });
    host.state = { ...host.state, loops: [loop] };

    const result = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });

    expect(result.ok).toBe(false);
    expect(host.state.loops).toHaveLength(1);
    expect(host.state.loops[0].runtime.workspace.resolved).toBeUndefined();
    expect(host.state.loops[0].runtime.workspace.preservedWorktrees?.map((entry) => entry.leaseId))
      .toEqual([second.lease.leaseId]);

    host.releaseOutcomes.delete(second.lease.leaseId);
    const retry = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });
    expect(retry.ok).toBe(true);
    expect(host.state.loops).toHaveLength(0);
  });

  it('persists each successful deletion release before attempting the next lease', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await leaseManagedWorktree(host);
    const second = await host.acquireWorktree({ holder: 'loop-1-r2', title: 'Task' });
    if (second.status !== 'acquired') throw new Error(second.reason);
    loop.runtime.workspace.resolved = first;
    loop.runtime.workspace.preservedWorktrees = [{
      slotId: second.lease.slotId,
      leaseId: second.lease.leaseId,
      worktreeKey: second.lease.leaseHolder,
      worktreePath: second.lease.worktreePath,
      outcome: 'preserved',
      reason: 'The branch holds work.',
      at: 't',
    }];
    host.state = { ...host.state, loops: [loop] };
    const releaseWorktree = host.releaseWorktree.bind(host);
    host.releaseWorktree = async (request) => {
      if (request.expectedLeaseId === second.lease.leaseId) throw new Error('simulated interruption');
      return releaseWorktree(request);
    };

    await expect(new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' }))
      .rejects.toThrow('simulated interruption');

    expect(host.state.loops[0].runtime.workspace.resolved).toBeUndefined();
    expect(host.state.loops[0].runtime.workspace.preservedWorktrees?.map((entry) => entry.leaseId))
      .toEqual([second.lease.leaseId]);
  });

  it('touches no worktree when none was resolved', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });
    expect(host.worktreesRemoved).toHaveLength(0);
  });

  it('errors for an unknown loop', async () => {
    const host = createFakeHost();
    const res = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'nope' });
    expect(res.ok).toBe(false);
  });
});
