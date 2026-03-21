import type { Card } from '../../shared/types';
import {
  buildCancelPrError,
  buildRevisionRequestError,
  appendReviewActionError,
} from './error-log-client';

interface ReviewActionContext {
  stateFilePath: string;
}

export async function persistRevisionRequest(
  ctx: ReviewActionContext,
  card: Pick<Card, 'id' | 'title'>,
  feedback: string,
): Promise<void> {
  await appendReviewActionError(ctx.stateFilePath, buildRevisionRequestError(card, feedback));
}

/**
 * Persist a PR cancellation to the error log.
 *
 * Worktree cleanup is NOT performed here — it is handled server-side by
 * the extension's `cancel-pr` action (which uses `execFile` with array
 * args, avoiding shell injection). The state update from `applyCancelPR`
 * clears `worktreePath`, and the orchestrator's cleanup cycle handles
 * any remaining worktree artifacts.
 */
export async function persistPrCancellation(
  ctx: ReviewActionContext,
  card: Pick<Card, 'id' | 'title'>,
): Promise<void> {
  await appendReviewActionError(ctx.stateFilePath, buildCancelPrError(card));
}
