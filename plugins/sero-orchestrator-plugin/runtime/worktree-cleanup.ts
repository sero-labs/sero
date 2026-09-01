import type { ResolvedWorkspaceContext } from '../shared/types';
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
  if (outcome.status !== 'released') {
    host.log(`loop ${loopId}: worktree release answered ${outcome.status} — ${outcome.reason}`);
  }
  return outcome;
}
