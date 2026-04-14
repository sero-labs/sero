import path from 'path';
import type { Card } from '@electron/features/kanban/core/types';
import type { ReviewResult } from '@electron/features/kanban/prompts';
import type { ReviewProgressTracker } from '../state/review-progress';
import {
  createCheckpointInWorktree,
  ensureRemoteDefaultBranch,
  pushWorktreeBranch,
  createPrFromWorktree,
} from '@electron/features/kanban/worktree/worktree-git';
import { startCardReviewPreview } from './review-preview';
import type { ReviewExecutorResult } from './review-executor-types';

export async function pushAndCreateReviewPr(
  workspaceId: string,
  review: ReviewResult,
  reviewRelPath: string,
  worktreePath: string,
  branchName: string,
  card: Pick<Card, 'id' | 'title'>,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  tracker.setPhase('Pushing branch');
  await tracker.flush();

  await createCheckpointInWorktree(worktreePath, `feat: ${card.title}`);

  const pushed = await pushWorktreeBranch(worktreePath, branchName);
  if (!pushed) {
    return {
      success: false,
      reviewFilePath: reviewRelPath,
      error: `Failed to push branch "${branchName}" to origin.`,
    };
  }

  tracker.setPhase('Creating PR');
  await tracker.flush();

  const baseBranch = await ensureRemoteDefaultBranch(worktreePath);
  const prResult = await createPrFromWorktree(worktreePath, {
    title: review.prTitle,
    body: review.prBody,
    baseBranch,
  });

  if (!prResult.success) {
    return {
      success: false,
      reviewFilePath: reviewRelPath,
      error: `PR creation failed: ${prResult.error}`,
    };
  }

  console.log(`[review-executor] PR created for card #${card.id}: ${prResult.url}`);
  const workspaceRoot = path.resolve(worktreePath, '..', '..', '..');
  const preview = await startCardReviewPreview(
    workspaceId,
    workspaceRoot,
    card,
    worktreePath,
    tracker,
  );
  if (preview.reason) {
    console.log(`[review-executor] Preview unavailable for card #${card.id}: ${preview.reason}`);
  }

  return {
    success: true,
    prUrl: prResult.url,
    prNumber: prResult.number,
    previewServerId: preview.previewServerId,
    previewUrl: preview.previewUrl,
    reviewFilePath: reviewRelPath,
  };
}

export async function resumeReviewFromCache(
  workspaceId: string,
  review: ReviewResult,
  reviewRelPath: string,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  const cardStub = { id: path.basename(worktreePath).replace('card-', ''), title: '' };
  return pushAndCreateReviewPr(
    workspaceId,
    review,
    reviewRelPath,
    worktreePath,
    branchName,
    cardStub,
    tracker,
  );
}
