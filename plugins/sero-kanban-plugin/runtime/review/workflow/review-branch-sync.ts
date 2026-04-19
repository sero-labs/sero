import type { Card, KanbanSettings } from '../../core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import { buildConflictResolutionPrompt } from '../../prompts/prompt-conflict-resolution';
import type { KanbanRuntimeHost } from '../../types';

export interface ReviewBranchSyncDeps {
  host: KanbanRuntimeHost;
  workspaceId: string;
  settings?: KanbanSettings;
}

export interface ReviewBranchSyncResult {
  success: boolean;
  invalidatedReviewCache: boolean;
  error?: string;
}

export async function syncReviewBranchWithDefault(
  deps: ReviewBranchSyncDeps,
  card: Card,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  parentSessionId: string,
): Promise<ReviewBranchSyncResult> {
  tracker.setPhase('Syncing with default branch');
  await tracker.flush();

  const result = await deps.host.git.syncWorktreeWithDefaultBranch(worktreePath, {
    resolveConflicts: async ({ attempt, baseBranch, conflictFiles }) => {
      const agentLabel = `conflict-resolver (${attempt})`;
      tracker.setPhase(`Resolving conflicts against ${baseBranch}`);
      tracker.addAgent(agentLabel);
      await tracker.flush();

      const resolution = await deps.host.subagents.runStructured({
        agent: 'implementer',
        task: buildConflictResolutionPrompt(card, baseBranch, conflictFiles, {
          reviewMode: deps.settings?.reviewMode,
        }),
        parentSessionId,
        workspaceId: deps.workspaceId,
        cwd: worktreePath,
        isolated: true,
        onUpdate: (text) => tracker.addLogLine(text),
      });

      tracker.completeAgent(agentLabel, resolution.error ? 'failed' : 'completed');
      return !resolution.error;
    },
  });

  if (!result.success) {
    return {
      success: false,
      invalidatedReviewCache: false,
      error: result.error ?? 'Failed to sync the card branch with the default branch.',
    };
  }

  if (result.updated) {
    const syncSummary = result.resolvedConflicts
      ? `Synced card branch onto ${result.baseBranch} with automatic conflict resolution`
      : `Synced card branch onto ${result.baseBranch}`;
    tracker.addLogLine(syncSummary);
  }

  return {
    success: true,
    invalidatedReviewCache: result.updated,
  };
}
