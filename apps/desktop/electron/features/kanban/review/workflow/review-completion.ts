/**
 * Review completion helpers — decides how to finish a review phase card
 * based on YOLO mode, auto-merge settings, and GitHub merge results.
 *
 * Extracted from the orchestrator to keep that file focused on phase
 * transitions and under the 500 LOC limit.
 */

import { buildAutoMergePendingMessage } from '@electron/features/kanban/quality/auto-merge-monitor';
import { mergePrFromWorktree } from '@electron/features/kanban/worktree/worktree-pr';
import { updateCard } from '@electron/features/kanban/core/state-helpers';
import type { KanbanSettings } from '@electron/features/kanban/core/types';

interface ReviewPrResult {
  prUrl?: string;
  prNumber?: number;
  previewServerId?: string;
  previewUrl?: string;
  reviewFilePath?: string;
}

interface ReviewCompletionContext {
  stateFilePath: string;
  cardId: string;
  worktreePath: string;
  yolo: boolean;
  settings: KanbanSettings | undefined;
}

export interface ReviewCompletionOutcome {
  /** 'done' if the card moved to done and needs cleanup, null otherwise. */
  movedToDone: boolean;
}

/**
 * Apply the correct post-review completion path for a card whose
 * review phase succeeded and produced a PR.
 */
export async function completeReviewWithPr(
  ctx: ReviewCompletionContext,
  result: ReviewPrResult,
): Promise<ReviewCompletionOutcome> {
  const autoMergePrs = ctx.settings?.yoloAutoMergePrs === true;
  const prNumber = result.prNumber;
  const prUpdate = {
    prUrl: result.prUrl,
    prNumber,
    previewServerId: result.previewServerId,
    previewUrl: result.previewUrl,
    reviewFilePath: result.reviewFilePath,
    reviewProgress: undefined,
    error: undefined,
  };

  if (ctx.yolo && autoMergePrs && typeof prNumber === 'number' && prNumber > 0) {
    return applyAutoMerge(ctx, prUpdate, prNumber);
  }

  if (ctx.yolo && autoMergePrs) {
    await updateCard(ctx.stateFilePath, ctx.cardId, {
      ...prUpdate,
      status: 'waiting-input',
      error: 'Auto-merge failed: PR number was not returned by GitHub.',
    });
    console.log(`[kanban-orchestrator] Card #${ctx.cardId} auto-merge skipped: missing PR number`);
    return { movedToDone: false };
  }

  if (ctx.yolo) {
    await updateCard(ctx.stateFilePath, ctx.cardId, {
      ...prUpdate, status: 'idle', column: 'done', completedAt: new Date().toISOString(),
    });
    console.log(`[kanban-orchestrator] Card #${ctx.cardId} YOLO auto-completed: ${result.prUrl}`);
    return { movedToDone: true };
  }

  // Non-YOLO: wait for human to merge and confirm
  await updateCard(ctx.stateFilePath, ctx.cardId, { ...prUpdate, status: 'waiting-input' });
  console.log(`[kanban-orchestrator] Card #${ctx.cardId} PR created: ${result.prUrl}`);
  return { movedToDone: false };
}

async function applyAutoMerge(
  ctx: ReviewCompletionContext,
  prUpdate: Record<string, unknown>,
  prNumber: number,
): Promise<ReviewCompletionOutcome> {
  const mergeResult = await mergePrFromWorktree(ctx.worktreePath, prNumber, { method: 'squash' });

  if (!mergeResult.success) {
    await updateCard(ctx.stateFilePath, ctx.cardId, {
      ...prUpdate,
      status: 'waiting-input',
      error: `Auto-merge failed: ${mergeResult.error}`,
    });
    console.log(`[kanban-orchestrator] Card #${ctx.cardId} auto-merge failed: ${mergeResult.error}`);
    return { movedToDone: false };
  }

  if (mergeResult.state === 'merged') {
    await updateCard(ctx.stateFilePath, ctx.cardId, {
      ...prUpdate, status: 'idle', column: 'done', completedAt: new Date().toISOString(),
    });
    console.log(`[kanban-orchestrator] Card #${ctx.cardId} YOLO auto-merged: ${prUpdate.prUrl}`);
    return { movedToDone: true };
  }

  // Scheduled for auto-merge — GitHub will merge once conditions are met
  await updateCard(ctx.stateFilePath, ctx.cardId, {
    ...prUpdate,
    status: 'waiting-input',
    error: buildAutoMergePendingMessage(prNumber),
  });
  console.log(`[kanban-orchestrator] Card #${ctx.cardId} queued for GitHub auto-merge: ${prUpdate.prUrl}`);
  return { movedToDone: false };
}
