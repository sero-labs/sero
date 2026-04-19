import type { Card } from '../../core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import type { ReviewIssue, ReviewResult, ReviewPromptOptions } from '../../prompts';
import {
  buildReviewPrompt,
  buildReviewRevisionPrompt,
  parseReviewResult,
} from '../../prompts';
import { bridgeSubagentLiveOutput } from '../../implementation/live-output-bridge';
import { shouldUseLightReview } from './light-review';
import { runLightReviewWorkflow } from './light-review-workflow';
import {
  deleteCachedReview,
  loadCachedReview,
  saveCachedReview,
} from '../state/review-cache';
import { createReviewSubmissionTool } from '../state/review-submission-tool';
import {
  getBlockingReviewFailure,
  getCriticalIssues,
  requiresReviewerApproval,
} from '../state/review-result-utils';
import { recoverWorkspaceRootChanges } from './review-worktree-recovery';
import { syncReviewBranchWithDefault } from './review-branch-sync';
import {
  pushAndCreateReviewPr,
  resumeReviewFromCache,
} from './review-pr-lifecycle';
import {
  resolveReviewExecutionPaths,
  type ReviewExecutorDeps,
  type ReviewExecutorResult,
} from './review-executor-types';
import { runReviewVerification } from './review-verification';

const MAX_CRITICAL_REVISIONS = 1;

export type { ReviewExecutorDeps, ReviewExecutorResult } from './review-executor-types';

export async function executeReview(
  deps: ReviewExecutorDeps,
  card: Card,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  const parentSessionId = `kanban-review-${card.id}`;
  const detachLiveOutput = bridgeSubagentLiveOutput(
    deps.host,
    deps.workspaceId,
    parentSessionId,
    tracker,
  );

  try {
    const reviewPaths = resolveReviewExecutionPaths(worktreePath, card.id);

    const branchSync = await syncReviewBranchWithDefault(
      deps,
      card,
      worktreePath,
      tracker,
      parentSessionId,
    );
    if (!branchSync.success) {
      return { success: false, error: branchSync.error ?? 'Failed to sync branch before review.' };
    }
    if (branchSync.invalidatedReviewCache) {
      await deleteCachedReview(reviewPaths.reviewFile);
      console.log(`[review-executor] Discarded cached review after syncing branch for card #${card.id}`);
    }

    console.log(`[review-executor] Checking for cached review at ${reviewPaths.reviewFile}`);
    const canReuseCachedReview = card.reviewFilePath === reviewPaths.reviewRelPath;
    const cached = branchSync.invalidatedReviewCache || !canReuseCachedReview
      ? null
      : await loadCachedReview(reviewPaths.reviewFile);
    if (cached) {
      console.log(`[review-executor] Resuming from cached review for card #${card.id} — skipping to push`);
      return resumeReviewFromCache(
        deps.host,
        deps.workspaceId,
        cached,
        reviewPaths.reviewRelPath,
        worktreePath,
        branchName,
        tracker,
      );
    }
    console.log('[review-executor] No cached review found — running full review pipeline');

    return runFreshReviewPipeline(
      deps,
      card,
      worktreePath,
      branchName,
      tracker,
      parentSessionId,
      reviewPaths.reviewFile,
      reviewPaths.reviewRelPath,
    );
  } finally {
    detachLiveOutput();
  }
}

async function runFreshReviewPipeline(
  deps: ReviewExecutorDeps,
  card: Card,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
  parentSessionId: string,
  reviewFile: string,
  reviewRelPath: string,
): Promise<ReviewExecutorResult> {
  const expectedPaths = card.subtasks.flatMap((subtask) => subtask.filePaths ?? []);
  const preflightRecovered = await recoverWorkspaceRootChanges(worktreePath, {
    expectedPaths,
  });
  if (preflightRecovered) {
    tracker.setPhase('Recovering misplaced changes');
    await tracker.flush();
  }

  const lightReviewEnabled = shouldUseLightReview(deps.settings);
  const reviewOptions: ReviewPromptOptions = {
    testingEnabled: deps.settings?.testingEnabled,
    reviewMode: deps.settings?.reviewMode,
  };

  for (let revisionPass = 0; revisionPass <= MAX_CRITICAL_REVISIONS; revisionPass++) {
    const passLabel = revisionPass === 0 ? 'changes' : 'revised changes';
    tracker.setPhase(`Checking ${passLabel}`);
    await tracker.flush();

    const reviewInputs = await prepareReviewInputs(deps, worktreePath, card, tracker, expectedPaths);
    if (reviewInputs.error) {
      return { success: false, error: reviewInputs.error };
    }

    if (lightReviewEnabled) {
      const lightReview = await runLightReviewWorkflow(
        deps,
        card,
        worktreePath,
        tracker,
        parentSessionId,
      );
      if (!lightReview.success || !lightReview.review) {
        return { success: false, error: lightReview.error ?? 'Light review failed.' };
      }

      await saveCachedReview(reviewFile, lightReview.review);
      console.log(`[review-executor] Saved light review to ${reviewRelPath}`);
      return pushAndCreateReviewPr(
        deps.host,
        deps.workspaceId,
        lightReview.review,
        reviewRelPath,
        worktreePath,
        branchName,
        card,
        tracker,
      );
    }

    const verificationError = await runReviewVerification(
      deps.host,
      deps.workspaceId,
      worktreePath,
      tracker,
      deps.settings,
    );
    if (verificationError) {
      return { success: false, error: verificationError };
    }

    const submitted = await runReviewerPass(
      deps,
      card,
      worktreePath,
      tracker,
      parentSessionId,
      revisionPass,
      reviewInputs.diff,
      reviewInputs.fileSummary,
      reviewOptions,
    );
    if (submitted.error || !submitted.review) {
      return { success: false, error: submitted.error ?? 'Reviewer failed to produce a review.' };
    }

    const reviewFailure = requiresReviewerApproval()
      ? getBlockingReviewFailure(submitted.review)
      : null;
    const criticalIssues = getCriticalIssues(submitted.review);

    if (!reviewFailure) {
      await saveCachedReview(reviewFile, submitted.review);
      console.log(`[review-executor] Saved review to ${reviewRelPath}`);
      return pushAndCreateReviewPr(
        deps.host,
        deps.workspaceId,
        submitted.review,
        reviewRelPath,
        worktreePath,
        branchName,
        card,
        tracker,
      );
    }

    if (revisionPass >= MAX_CRITICAL_REVISIONS || criticalIssues.length === 0) {
      await saveCachedReview(reviewFile, submitted.review);
      console.log(`[review-executor] Saved review to ${reviewRelPath}`);
      return { success: false, error: reviewFailure };
    }

    const revisionError = await runCriticalRevisionPass(
      deps,
      card,
      worktreePath,
      tracker,
      parentSessionId,
      revisionPass,
      criticalIssues,
      submitted.review.summary,
    );
    if (revisionError) {
      return { success: false, error: revisionError };
    }
  }

  return { success: false, error: 'Review failed to produce a final result.' };
}

async function prepareReviewInputs(
  deps: ReviewExecutorDeps,
  worktreePath: string,
  card: Card,
  tracker: ReviewProgressTracker,
  expectedPaths: string[],
): Promise<{ diff: string; fileSummary: string; error?: string }> {
  await deps.host.git.createCheckpoint(worktreePath, `feat: ${card.title}`);

  let [diff, fileSummary] = await Promise.all([
    deps.host.git.getDiff(worktreePath),
    deps.host.git.getDiffSummary(worktreePath),
  ]);

  if (!diff.trim()) {
    tracker.setPhase('Recovering files');
    await tracker.flush();

    const recovered = await recoverWorkspaceRootChanges(worktreePath, {
      expectedPaths,
      allowAllDirty: true,
    });
    if (recovered) {
      await deps.host.git.createCheckpoint(worktreePath, `feat: ${card.title}`);
      [diff, fileSummary] = await Promise.all([
        deps.host.git.getDiff(worktreePath),
        deps.host.git.getDiffSummary(worktreePath),
      ]);
    }
  }

  if (!diff.trim()) {
    return { diff, fileSummary, error: 'No changes to review — diff is empty.' };
  }

  return { diff, fileSummary };
}

async function runReviewerPass(
  deps: ReviewExecutorDeps,
  card: Card,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  parentSessionId: string,
  revisionPass: number,
  diff: string,
  fileSummary: string,
  reviewOptions: ReviewPromptOptions,
): Promise<{ review?: ReviewResult; error?: string }> {
  const reviewerLabel = revisionPass === 0 ? 'reviewer' : `reviewer (${revisionPass + 1})`;
  tracker.setPhase(revisionPass === 0 ? 'Reviewing changes' : `Re-reviewing changes (${revisionPass + 1})`);
  tracker.addAgent(reviewerLabel);
  await tracker.flush();

  let submittedReview: ReviewResult | null = null;
  const rawReview = await deps.host.subagents.runStructured({
    agent: 'reviewer',
    task: buildReviewPrompt(card, diff, fileSummary, reviewOptions),
    parentSessionId,
    workspaceId: deps.workspaceId,
    cwd: worktreePath,
    isolated: true,
    customTools: [
      createReviewSubmissionTool(card.title, {
        submitReview: async (review) => {
          const outcome = submittedReview ? 'updated' : 'recorded';
          submittedReview = review;
          return outcome;
        },
      }),
    ],
    onUpdate: (text) => tracker.addLogLine(text),
  });
  if (rawReview.error) {
    tracker.completeAgent(reviewerLabel, 'failed');
    return { error: `Reviewer failed: ${rawReview.error}` };
  }

  const review = submittedReview ?? parseReviewResult(rawReview.response, card.title);
  tracker.completeAgent(reviewerLabel);
  return { review };
}

async function runCriticalRevisionPass(
  deps: ReviewExecutorDeps,
  card: Card,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  parentSessionId: string,
  revisionPass: number,
  criticalIssues: ReviewIssue[],
  reviewSummary: string,
): Promise<string | null> {
  const reviserLabel = `implementer (${revisionPass + 1})`;
  tracker.setPhase(`Fixing critical review feedback (${revisionPass + 1}/${MAX_CRITICAL_REVISIONS})`);
  tracker.addAgent(reviserLabel);
  await tracker.flush();

  const revisionResult = await deps.host.subagents.runStructured({
    agent: 'implementer',
    task: buildReviewRevisionPrompt(card, criticalIssues, reviewSummary, {
      testingEnabled: deps.settings?.testingEnabled,
      reviewMode: deps.settings?.reviewMode,
    }),
    parentSessionId,
    workspaceId: deps.workspaceId,
    cwd: worktreePath,
    isolated: true,
    onUpdate: (text) => tracker.addLogLine(text),
  });

  tracker.completeAgent(reviserLabel, revisionResult.error ? 'failed' : 'completed');
  if (revisionResult.error) {
    return `Critical review revision failed: ${revisionResult.error}`;
  }

  return null;
}
