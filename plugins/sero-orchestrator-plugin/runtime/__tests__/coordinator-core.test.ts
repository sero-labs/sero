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

describe('Coordinator delete', () => {
  const managedWorktree: ResolvedWorkspaceContext = {
    id: 'ws', type: 'managed-worktree', workspaceRoot: '/root',
    cwd: '/root/.sero/worktrees/loop-1', worktreePath: '/root/.sero/worktrees/loop-1',
    branchName: 'orchestrator/loop-1', resolvedBy: 'create-option', createdAt: 't',
  };

  it('removes the loop from state', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });
    expect(res.ok).toBe(true);
    expect(host.state.loops).toHaveLength(0);
  });

  it('removes a resolved managed worktree on delete, keeping the branch by default', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runtime.workspace.resolved = managedWorktree;
    host.state = { ...host.state, loops: [loop] };
    await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1' });
    expect(host.worktreesRemoved).toContain('loop-1');
    expect(host.worktreeRemovals[0]).toMatchObject({ loopId: 'loop-1', deleteBranch: undefined });
    expect(host.state.loops).toHaveLength(0);
  });

  it('deletes the local branch too when deleteBranch is set', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runtime.workspace.resolved = managedWorktree;
    host.state = { ...host.state, loops: [loop] };
    await new Coordinator(host).requestAction({ kind: 'delete', loopId: 'loop-1', deleteBranch: true });
    expect(host.worktreeRemovals[0]).toMatchObject({ loopId: 'loop-1', deleteBranch: true });
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
