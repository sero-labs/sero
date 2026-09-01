import type { Loop, PreservedWorktreeRecord, ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost, ReleaseWorktreeResult, WorktreeDisposition } from './host';

/** How many preserved checkouts a loop remembers. Oldest fall off the end. */
const PRESERVED_LIMIT = 20;

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
  if (outcome.status !== 'released') {
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
export async function releaseDeletedLoopWorktree(
  host: OrchestratorHost,
  loopId: string,
  workspace: ResolvedWorkspaceContext | undefined,
  deleteBranch?: boolean,
): Promise<void> {
  if (workspace?.type !== 'managed-worktree') return;
  if (!workspace.slotId || !workspace.leaseId) {
    host.log(`Deleting loop ${loopId}: its checkout predates the worktree pool and was left in place.`);
    return;
  }
  const outcome = await host.releaseWorktree({
    slotId: workspace.slotId,
    expectedLeaseId: workspace.leaseId,
    disposition: 'remove',
    deleteBranch: workspace.externalBranch ? undefined : deleteBranch,
  });
  if (outcome.status !== 'released') {
    host.log(`Deleting loop ${loopId}: its checkout was kept (${outcome.status}) — ${outcome.reason}`);
  }
}

/**
 * Turns a release that did NOT free the checkout into a record the loop keeps.
 *
 * A released checkout is gone and needs no reference. Anything else left work
 * on disk, and the loop is about to re-arm with a fresh workspace — so without
 * this the only trace would be in the pool, and nothing on the loop's side
 * would name what happened or where.
 */
export function preservedWorktreeRecord(
  host: OrchestratorHost,
  workspace: ResolvedWorkspaceContext | undefined,
  outcome: ReleaseWorktreeResult | null,
): PreservedWorktreeRecord | null {
  if (!outcome || outcome.status === 'released') return null;
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
export async function cleanupAndCarry(host: OrchestratorHost, loop: Loop): Promise<Loop> {
  const prior = loop.runtime.workspace.resolved;
  const released = await cleanupPreviousWorktree(host, loop.id, prior);
  return withPreservedWorktree(loop, preservedWorktreeRecord(host, prior, released));
}

/** Adds one record, newest first, replacing any earlier entry for the same lease. */
export function withPreservedWorktree(loop: Loop, record: PreservedWorktreeRecord | null): Loop {
  if (!record) return loop;
  const existing = loop.runtime.workspace.preservedWorktrees ?? [];
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      workspace: {
        ...loop.runtime.workspace,
        preservedWorktrees: [record, ...existing.filter((entry) => entry.leaseId !== record.leaseId)]
          .slice(0, PRESERVED_LIMIT),
      },
    },
  };
}
