import type { ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost } from './host';

export type WorktreeCleanupResult =
  | { removed: true }
  | { removed: false; error: string };

/** Remove a completed iteration's checkout without discarding local changes. */
export async function cleanupPreviousWorktree(
  host: OrchestratorHost,
  loopId: string,
  workspace: ResolvedWorkspaceContext | undefined,
): Promise<WorktreeCleanupResult> {
  if (workspace?.type !== 'managed-worktree') return { removed: true };
  const worktreeKey = workspace.worktreeKey ?? loopId;
  const worktreePath = workspace.worktreePath ?? workspace.cwd;
  try {
    await host.removeWorktree(worktreeKey, {
      deleteMergedBranch: workspace.externalBranch ? undefined : true,
    });
    return { removed: true };
  } catch (error) {
    const message = `Could not remove ${worktreeKey}, so its checkout was kept at ${worktreePath}: ${String(error)}`;
    host.log(message);
    return { removed: false, error: message };
  }
}
