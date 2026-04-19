import { buildAutoMergePendingMessage } from '../../quality/auto-merge-monitor';
import { updateCard } from '../../core/state-helpers';
import type { KanbanSettings } from '../../core/types';
import type { KanbanRuntimeHost } from '../../types';

interface ReviewPrResult {
  prUrl?: string;
  prNumber?: number;
  previewServerId?: string;
  previewUrl?: string;
  reviewFilePath?: string;
}

interface ReviewCompletionContext {
  host: KanbanRuntimeHost;
  stateFilePath: string;
  cardId: string;
  worktreePath: string;
  yolo: boolean;
  settings: KanbanSettings | undefined;
}

export interface ReviewCompletionOutcome {
  movedToDone: boolean;
}

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
    await updateCard(ctx.host.appState, ctx.stateFilePath, ctx.cardId, {
      ...prUpdate,
      status: 'waiting-input',
      error: 'Auto-merge failed: PR number was not returned by GitHub.',
    });
    console.log(`[kanban-runtime] Card #${ctx.cardId} auto-merge skipped: missing PR number`);
    return { movedToDone: false };
  }

  if (ctx.yolo) {
    await updateCard(ctx.host.appState, ctx.stateFilePath, ctx.cardId, {
      ...prUpdate,
      status: 'idle',
      column: 'done',
      completedAt: new Date().toISOString(),
    });
    console.log(`[kanban-runtime] Card #${ctx.cardId} YOLO auto-completed: ${result.prUrl}`);
    return { movedToDone: true };
  }

  await updateCard(ctx.host.appState, ctx.stateFilePath, ctx.cardId, {
    ...prUpdate,
    status: 'waiting-input',
  });
  console.log(`[kanban-runtime] Card #${ctx.cardId} PR created: ${result.prUrl}`);
  return { movedToDone: false };
}

async function applyAutoMerge(
  ctx: ReviewCompletionContext,
  prUpdate: Record<string, unknown>,
  prNumber: number,
): Promise<ReviewCompletionOutcome> {
  const mergeResult = await ctx.host.git.mergePr(ctx.worktreePath, prNumber, { method: 'squash' });

  if (!mergeResult.success) {
    await updateCard(ctx.host.appState, ctx.stateFilePath, ctx.cardId, {
      ...prUpdate,
      status: 'waiting-input',
      error: `Auto-merge failed: ${mergeResult.error}`,
    });
    console.log(`[kanban-runtime] Card #${ctx.cardId} auto-merge failed: ${mergeResult.error}`);
    return { movedToDone: false };
  }

  if (mergeResult.state === 'merged') {
    await updateCard(ctx.host.appState, ctx.stateFilePath, ctx.cardId, {
      ...prUpdate,
      status: 'idle',
      column: 'done',
      completedAt: new Date().toISOString(),
    });
    console.log(`[kanban-runtime] Card #${ctx.cardId} YOLO auto-merged: ${prUpdate.prUrl}`);
    return { movedToDone: true };
  }

  await updateCard(ctx.host.appState, ctx.stateFilePath, ctx.cardId, {
    ...prUpdate,
    status: 'waiting-input',
    error: buildAutoMergePendingMessage(prNumber),
  });
  console.log(`[kanban-runtime] Card #${ctx.cardId} queued for GitHub auto-merge: ${prUpdate.prUrl}`);
  return { movedToDone: false };
}
