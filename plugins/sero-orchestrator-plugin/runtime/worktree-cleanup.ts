import type { ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost } from './host';

/**
 * Removes a completed iteration's checkout. Loop-owned branches are deleted
 * only when Git confirms they are fully merged; unmerged work and branches
 * checked out from external pull requests are preserved.
 */
export async function cleanupPreviousWorktree(
  host: OrchestratorHost,
  loopId: string,
  workspace: ResolvedWorkspaceContext | undefined,
): Promise<void> {
  if (workspace?.type !== 'managed-worktree') return;
  await host.removeWorktree(workspace.worktreeKey ?? loopId, {
    force: true,
    deleteMergedBranch: workspace.externalBranch ? undefined : true,
  });
}
