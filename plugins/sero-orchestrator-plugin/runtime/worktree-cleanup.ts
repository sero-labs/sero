import type { Loop, PreservedWorktreeRecord, ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost, ReleaseWorktreeResult, WorktreeDisposition } from './host';

/**
 * Releases a completed iteration's checkout.
 *
 * The release is fenced on the run's exact lease identity, never on its
 * logical key: a key-addressed cleanup arriving late would reset whatever that
 * key now points at, which is the race this contract exists to close. A
 * context with no lease identity was resolved before the pool existed and is
 * left alone — proving and adopting it is `reattachWorktree`'s job, not
 * cleanup's.
 *
 * The disposition is intent. The host re-classifies the checkout and preserves
 * it whenever removal cannot be proved safe, so uncommitted work, an unmerged
 * branch, or a pull-request branch all survive this call.
 */
export async function cleanupPreviousWorktree(
  host: OrchestratorHost,
  loopId: string,
  workspace: ResolvedWorkspaceContext | undefined,
  disposition: WorktreeDisposition = 'recycle',
): Promise<ReleaseWorktreeResult | null> {
  if (workspace?.type !== 'managed-worktree') return null;
  if (!workspace.slotId || !workspace.leaseId) {
    host.log(`loop ${loopId}: its checkout predates the worktree pool, so it was left for recovery rather than released.`);
    return null;
  }
  const outcome = await host.releaseWorktree({
    slotId: workspace.slotId,
    expectedLeaseId: workspace.leaseId,
    disposition,
    // A pull-request branch belongs to the PR — its local branch is never ours
    // to delete, however the checkout itself is disposed of.
    deleteMergedBranch: workspace.externalBranch ? undefined : true,
  });
  if (outcome.checkout !== 'removed') {
    host.log(`loop ${loopId}: worktree release answered ${outcome.status} — ${outcome.reason}`);
  }
  return outcome;
}

/**
 * Disposes of a deleted loop's checkout. `remove` is authorised disposal, so
 * committed work no longer blocks it, but the host still preserves a checkout
 * holding uncommitted work or one it cannot verify. `deleteBranch` never
 * reaches an event-pr branch, which belongs to the PR and not to this loop
 * (spec 15, FR-P2). A checkout with no lease identity predates the pool and is
 * left in place: a logical key is not a release fence.
 */
export interface DeletedLoopWorktreeResult {
  loop: Loop;
  released: boolean;
  error?: string;
}

async function persistDeletedLeaseRelease(
  host: OrchestratorHost,
  loopId: string,
  leaseId: string,
): Promise<void> {
  await host.updateState((state) => ({
    ...state,
    loops: state.loops.map((entry) => entry.id !== loopId ? entry : {
      ...entry,
      runtime: {
        ...entry.runtime,
        workspace: {
          ...entry.runtime.workspace,
          resolved: entry.runtime.workspace.resolved?.leaseId === leaseId
            ? undefined
            : entry.runtime.workspace.resolved,
          preservedWorktrees: entry.runtime.workspace.preservedWorktrees
            ?.filter((record) => record.leaseId !== leaseId),
        },
      },
    }),
  }));
}

/** Releases every checkout the loop still names, retaining any failed references. */
export async function releaseDeletedLoopWorktrees(
  host: OrchestratorHost,
  loop: Loop,
  deleteBranch?: boolean,
): Promise<DeletedLoopWorktreeResult> {
  let current = loop.runtime.workspace.resolved;
  let preserved = loop.runtime.workspace.preservedWorktrees ?? [];
  const failures: string[] = [];

  if (current?.type === 'managed-worktree') {
    if (!current.slotId || !current.leaseId) {
      failures.push('its current checkout predates the worktree pool and has no safe release identity');
    } else {
      const leaseId = current.leaseId;
      const outcome = await host.releaseWorktree({
        slotId: current.slotId,
        expectedLeaseId: leaseId,
        disposition: 'remove',
        deleteBranch: current.externalBranch ? undefined : deleteBranch,
      });
      if (outcome.checkout === 'removed') {
        current = undefined;
        await persistDeletedLeaseRelease(host, loop.id, leaseId);
      } else failures.push(`current lease ${current.leaseId}: ${outcome.status} (${outcome.reason})`);
    }
  }

  for (const record of [...preserved]) {
    const outcome = await host.releaseWorktree({
      slotId: record.slotId,
      expectedLeaseId: record.leaseId,
      disposition: 'remove',
      deleteBranch,
    });
    if (outcome.checkout === 'removed') {
      preserved = preserved.filter((entry) => entry.leaseId !== record.leaseId);
      await persistDeletedLeaseRelease(host, loop.id, record.leaseId);
    } else {
      failures.push(`preserved lease ${record.leaseId}: ${outcome.status} (${outcome.reason})`);
    }
  }

  const fallback: Loop = {
    ...loop,
    runtime: {
      ...loop.runtime,
      workspace: {
        ...loop.runtime.workspace,
        resolved: current,
        preservedWorktrees: preserved.length > 0 ? preserved : undefined,
      },
    },
  };
  const updated = (await host.readState())?.loops.find((entry) => entry.id === loop.id) ?? fallback;
  if (failures.length === 0
    && (updated.runtime.workspace.resolved?.type === 'managed-worktree'
      || updated.runtime.workspace.preservedWorktrees?.length)) {
    failures.push('additional checkout references appeared while deletion was in progress');
  }
  if (failures.length === 0) return { loop: updated, released: true };
  const error = `Loop ${loop.id} was not deleted because ${failures.join('; ')}.`;
  host.log(error);
  return { loop: updated, released: false, error };
}

/**
 * Turns a release that retained the checkout into a record the loop keeps.
 *
 * A removed checkout needs no reference. A retained checkout is still owned by
 * its exact lease, and the loop is about to re-arm with a fresh workspace. A
 * stale answer proves neither retention nor removal and must block re-arming.
 */
export function preservedWorktreeRecord(
  host: OrchestratorHost,
  workspace: ResolvedWorkspaceContext | undefined,
  outcome: ReleaseWorktreeResult | null,
): PreservedWorktreeRecord | null {
  if (!outcome || outcome.checkout !== 'retained'
    || outcome.status === 'released' || outcome.status === 'stale-lease') return null;
  if (!workspace?.worktreePath || !workspace.slotId || !workspace.leaseId) return null;
  return {
    slotId: workspace.slotId,
    leaseId: workspace.leaseId,
    worktreeKey: workspace.worktreeKey ?? workspace.slotId,
    worktreePath: workspace.worktreePath,
    branchName: workspace.branchName,
    outcome: outcome.status,
    reason: outcome.reason,
    at: host.now(),
  };
}

/**
 * Releases the loop's current checkout and hands back the loop with a record
 * of anything the host kept. The two belong together: the caller's very next
 * act is to re-arm, which clears the workspace, so a release that preserved
 * work and a loop that no longer names it are one step apart.
 */
export type CleanupAndCarryResult =
  | { ok: true; loop: Loop }
  | { ok: false; loop: Loop; error: string };

export async function cleanupAndCarry(host: OrchestratorHost, loop: Loop): Promise<CleanupAndCarryResult> {
  const prior = loop.runtime.workspace.resolved;
  const released = await cleanupPreviousWorktree(host, loop.id, prior);
  if (prior?.type === 'managed-worktree' && (!released || released.checkout === 'unknown')) {
    const reason = released?.reason ?? 'the checkout has no pool lease identity';
    const error = `Loop ${loop.id} cannot start a fresh pass because its previous checkout could not be released safely: ${reason}`;
    host.log(error);
    return { ok: false, loop, error };
  }
  return { ok: true, loop: withPreservedWorktree(loop, preservedWorktreeRecord(host, prior, released)) };
}

/** Adds one live record, newest first, replacing any earlier entry for the same lease. */
export function withPreservedWorktree(loop: Loop, record: PreservedWorktreeRecord | null): Loop {
  if (!record) return loop;
  const existing = loop.runtime.workspace.preservedWorktrees ?? [];
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      workspace: {
        ...loop.runtime.workspace,
        preservedWorktrees: [record, ...existing.filter((entry) => entry.leaseId !== record.leaseId)],
      },
    },
  };
}
