import path from 'path';
import type { Card } from '../../core/types';
import type { ReviewResult } from '../../prompts';
import type { ReviewProgressTracker } from '../state/review-progress';
import type { KanbanRuntimeHost } from '../../types';
import { startCardReviewPreview } from './review-preview';
import type { ReviewExecutorResult } from './review-executor-types';

export async function pushAndCreateReviewPr(
  host: KanbanRuntimeHost,
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

  await host.git.createCheckpoint(worktreePath, `feat: ${card.title}`);

  const pushed = await host.git.pushBranch(worktreePath, branchName);
  if (!pushed) {
    return {
      success: false,
      reviewFilePath: reviewRelPath,
      error: `Failed to push branch "${branchName}" to origin.`,
    };
  }

  tracker.setPhase('Creating PR');
  await tracker.flush();

  const baseBranch = await host.git.ensureRemoteDefaultBranch(worktreePath);
  const prResult = await host.git.createPr(worktreePath, {
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
    { host },
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
  host: KanbanRuntimeHost,
  workspaceId: string,
  review: ReviewResult,
  reviewRelPath: string,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  const cardStub = { id: path.basename(worktreePath).replace('card-', ''), title: '' };
  return pushAndCreateReviewPr(
    host,
    workspaceId,
    review,
    reviewRelPath,
    worktreePath,
    branchName,
    cardStub,
    tracker,
  );
}
