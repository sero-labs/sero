/**
 * Preserving a checkout is the NORMAL outcome for a run that committed
 * anything: its branch then holds work the base does not, and the lifecycle
 * keeps that checkout until an explicit cleanup. The next iteration re-arms
 * with a fresh workspace, so unless the reference survives the re-arm, the
 * loop forgets work that is still on disk and still leased.
 *
 * Every path that starts a fresh iteration is covered here — scheduled,
 * event-fired and manual restart — because each one re-arms independently.
 */

import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import type { EngineDeps } from '../engine-types';
import type { Loop, LoopTrigger, OrchestratorEvent, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };
const NOW = '2026-06-22T10:00:00.000Z';
const KEPT = 'The branch holds 2 commit(s) the base does not.';

function coordinator(host: FakeHost, overrides: Partial<EngineDeps> = {}): Coordinator {
  return new Coordinator(host, createEngineDeps(new LoopLocks(), overrides));
}

/**
 * A settled recurring loop holding a lease the host will refuse to release.
 * Returns the loop as persisted, so a test can name the lease it expects back.
 */
async function settledLoopWithKeptCheckout(
  host: FakeHost,
  triggers: LoopTrigger[],
): Promise<{ slotId: string; leaseId: string; worktreePath: string }> {
  const seeded = seedActiveLoop(host, oneStepPlan().plan);
  const acquired = await host.acquireWorktree({ holder: 'loop-1-r1', title: 'Task' });
  if (acquired.status !== 'acquired') throw new Error(acquired.reason);
  host.releaseOutcomes.set(acquired.lease.leaseId, {
    status: 'preserved',
    slotId: acquired.lease.slotId,
    reason: KEPT,
  });

  const loop: Loop = {
    ...seeded,
    triggers,
    // The previous pass finished, so the next request starts a fresh one.
    runtime: {
      ...seeded.runtime,
      runSeq: 1,
      stepStates: {
        'step-1': { status: 'succeeded', attempts: 1, outcome: SUCCESS, updatedAt: 't' },
      },
      workspace: {
        resolved: {
          id: 'ws-1',
          type: 'managed-worktree',
          workspaceRoot: host.workspacePath,
          cwd: acquired.lease.worktreePath,
          worktreePath: acquired.lease.worktreePath,
          branchName: acquired.lease.branchName,
          worktreeKey: 'loop-1-r1',
          slotId: acquired.lease.slotId,
          leaseId: acquired.lease.leaseId,
          resolvedBy: 'create-option',
          createdAt: NOW,
        },
      },
    },
  };
  host.state = { ...host.state, loops: [loop] };
  return {
    slotId: acquired.lease.slotId,
    leaseId: acquired.lease.leaseId,
    worktreePath: acquired.lease.worktreePath,
  };
}

function cronTrigger(): LoopTrigger {
  return {
    id: 'c', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron',
    schedule: '0 * * * *', nextFireAt: NOW, fireCount: 1,
  };
}

function eventTrigger(): LoopTrigger {
  return {
    id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event',
    eventSource: 'github:ci-failed', fireCount: 0,
  };
}

function ciEvent(): OrchestratorEvent {
  return { id: 'evt-1', source: 'github:ci-failed', payload: {}, occurredAt: NOW };
}

function preservedOf(host: FakeHost) {
  return host.state.loops[0].runtime.workspace.preservedWorktrees ?? [];
}

describe('a checkout the host kept is not forgotten by the next iteration', () => {
  it('survives a scheduled fresh pass', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const lease = await settledLoopWithKeptCheckout(host, [cronTrigger()]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .requestAction({ kind: 'run_next', loopId: 'loop-1' });

    // The workspace was re-armed for the new iteration...
    expect(host.state.loops[0].runtime.workspace.resolved?.leaseId).not.toBe(lease.leaseId);
    // ...and the kept checkout is still named, with the host's own reason.
    expect(preservedOf(host)).toEqual([expect.objectContaining({
      slotId: lease.slotId,
      leaseId: lease.leaseId,
      worktreeKey: 'loop-1-r1',
      worktreePath: lease.worktreePath,
      outcome: 'preserved',
      reason: KEPT,
    })]);
  });

  it('survives an event-fired iteration', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const lease = await settledLoopWithKeptCheckout(host, [eventTrigger()]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) }).fireEvent(ciEvent());

    expect(preservedOf(host)).toEqual([expect.objectContaining({
      leaseId: lease.leaseId,
      outcome: 'preserved',
      reason: KEPT,
    })]);
  });

  it('survives a manual restart', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const lease = await settledLoopWithKeptCheckout(host, [cronTrigger()]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .requestAction({ kind: 'run_again', loopId: 'loop-1' });

    expect(preservedOf(host)).toEqual([expect.objectContaining({
      leaseId: lease.leaseId,
      outcome: 'preserved',
      reason: KEPT,
    })]);
  });

  it('records a recovery-required outcome the same way', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const lease = await settledLoopWithKeptCheckout(host, [cronTrigger()]);
    host.releaseOutcomes.set(lease.leaseId, {
      status: 'recovery-required',
      slotId: lease.slotId,
      reason: 'The checkout is on a detached HEAD.',
    });

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .requestAction({ kind: 'run_next', loopId: 'loop-1' });

    expect(preservedOf(host)).toEqual([expect.objectContaining({
      leaseId: lease.leaseId,
      outcome: 'recovery-required',
    })]);
  });

  it('records nothing when the checkout really was released', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const lease = await settledLoopWithKeptCheckout(host, [cronTrigger()]);
    host.releaseOutcomes.delete(lease.leaseId);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .requestAction({ kind: 'run_next', loopId: 'loop-1' });

    expect(preservedOf(host)).toEqual([]);
  });
});
