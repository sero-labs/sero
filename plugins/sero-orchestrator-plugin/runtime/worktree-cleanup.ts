import type { ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost } from './host';

/**
 * Saves and removes a completed iteration's checkout. A failed checkpoint or
 * removal keeps the checkout and must not stop the next loop iteration.
 */
export async function cleanupPreviousWorktree(
  host: OrchestratorHost,
  loopId: string,
  workspace: ResolvedWorkspaceContext | undefined,
): Promise<void> {
  if (workspace?.type !== 'managed-worktree') return;
  const worktreeKey = workspace.worktreeKey ?? loopId;
  const worktreePath = workspace.worktreePath ?? workspace.cwd;
  try {
    await host.createCheckpoint(worktreePath, `Loop checkpoint before cleanup: ${loopId}`);
  } catch (error) {
    host.log(`Could not checkpoint ${worktreeKey} before cleanup: ${String(error)}`);
  }
  try {
    await host.removeWorktree(worktreeKey, {
      deleteMergedBranch: workspace.externalBranch ? undefined : true,
    });
  } catch (error) {
    host.log(`Could not remove ${worktreeKey}, so its checkout was kept at ${worktreePath}: ${String(error)}`);
  }
}
