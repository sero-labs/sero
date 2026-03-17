/**
 * ReviewExecutor — runs the review phase for a kanban card.
 *
 * Handles: diff generation, reviewer subagent, branch push, PR creation.
 * The expensive reviewer result is cached to a JSON file so restarts
 * can resume from push/PR without re-running the subagent.
 */

import path from 'path';

import type { Card } from './types';
import type { ReviewProgressTracker } from './review-progress';
import type { ReviewResult } from './prompts';
import {
  buildReviewPrompt,
  buildReviewRevisionPrompt,
  parseReviewResult,
} from './prompts';
import type { ReviewPromptOptions } from './prompts';
import { bridgeSubagentLiveOutput } from './live-output-bridge';
import {
  detectVerificationCommands,
  runVerificationCommands,
  summarizeVerificationFailure,
} from './verification';
import { runWorkspaceCommand } from './workspace-command-runner';
import type { KanbanSettings } from './types';
import { shouldUseLightReview } from './light-review';
import { runLightReviewWorkflow } from './light-review-workflow';
import {
  createCheckpointInWorktree,
  ensureRemoteDefaultBranch,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
  createPrFromWorktree,
} from './worktree-git';
import {
  deleteCachedReview,
  loadCachedReview,
  saveCachedReview,
} from './review-cache';
import { createReviewSubmissionTool } from './review-submission-tool';
import {
  getBlockingReviewFailure,
  getCriticalIssues,
  requiresReviewerApproval,
} from './review-result-utils';
import { recoverWorkspaceRootChanges } from './review-worktree-recovery';
import { syncReviewBranchWithDefault } from './review-branch-sync';
import { startCardReviewPreview } from './review-preview';
import type { SubagentManager } from '../subagent/index';

const MAX_CRITICAL_REVISIONS = 1;

export interface ReviewExecutorDeps {
  subagentManager: SubagentManager;
  workspaceId: string;
  settings?: KanbanSettings;
}

export interface ReviewExecutorResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  previewServerId?: string;
  previewUrl?: string;
  /** Relative path to the cached review file (set when review is generated). */
  reviewFilePath?: string;
  error?: string;
}

/**
 * Execute the full review pipeline for a card:
 * 1. Check diff
 * 2. Run reviewer subagent (or load cached review)
 * 3. Push branch to origin
 * 4. Create PR via `gh` CLI
 */
export async function executeReview(
  deps: ReviewExecutorDeps,
  card: Card,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  const parentSessionId = `kanban-review-${card.id}`;
  const detachLiveOutput = bridgeSubagentLiveOutput(
    deps.subagentManager,
    deps.workspaceId,
    parentSessionId,
    tracker,
  );

  try {
  // Derive workspace root (worktree is at <ws>/.sero/worktrees/card-<id>)
    const workspaceRoot = path.resolve(worktreePath, '..', '..', '..');
    const reviewDir = path.join(workspaceRoot, '.sero', 'apps', 'kanban', 'reviews');
    const reviewFile = path.join(reviewDir, `card-${card.id}.json`);
    const reviewRelPath = path.relative(workspaceRoot, reviewFile);

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
      await deleteCachedReview(reviewFile);
      console.log(`[review-executor] Discarded cached review after syncing branch for card #${card.id}`);
    }

    // ── Try to load cached review ──────────────────────────
    console.log(`[review-executor] Checking for cached review at ${reviewFile}`);
    const cached = branchSync.invalidatedReviewCache ? null : await loadCachedReview(reviewFile);
    if (cached) {
      console.log(`[review-executor] Resuming from cached review for card #${card.id} — skipping to push`);
      return resumeFromReview(deps.workspaceId, cached, reviewRelPath, worktreePath, branchName, tracker);
    }
    console.log(`[review-executor] No cached review found — running full review pipeline`);

    const expectedPaths = card.subtasks.flatMap((subtask) => subtask.filePaths ?? []);
    const preflightRecovered = await recoverWorkspaceRootChanges(worktreePath, {
      expectedPaths,
    });
    if (preflightRecovered) {
      tracker.setPhase('Recovering misplaced changes');
      await tracker.flush();
    }
    const lightReviewEnabled = shouldUseLightReview(deps.settings);
    const reviewOpts: ReviewPromptOptions = {
      testingEnabled: deps.settings?.testingEnabled,
      reviewMode: deps.settings?.reviewMode,
    };

    for (let revisionPass = 0; revisionPass <= MAX_CRITICAL_REVISIONS; revisionPass++) {
      const passLabel = revisionPass === 0 ? 'changes' : 'revised changes';
      tracker.setPhase(`Checking ${passLabel}`);
      await tracker.flush();

      await createCheckpointInWorktree(worktreePath, `feat: ${card.title}`);

      let [diff, fileSummary] = await Promise.all([
        getWorktreeDiff(worktreePath),
        getWorktreeDiffSummary(worktreePath),
      ]);

      if (!diff.trim()) {
        tracker.setPhase('Recovering files');
        await tracker.flush();

        const recovered = await recoverWorkspaceRootChanges(worktreePath, {
          expectedPaths,
          allowAllDirty: true,
        });
        if (recovered) {
          await createCheckpointInWorktree(worktreePath, `feat: ${card.title}`);
          [diff, fileSummary] = await Promise.all([
            getWorktreeDiff(worktreePath),
            getWorktreeDiffSummary(worktreePath),
          ]);
        }
      }

      if (!diff.trim()) {
        return { success: false, error: 'No changes to review — diff is empty.' };
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
        return pushAndCreatePr(
          deps.workspaceId,
          lightReview.review,
          reviewRelPath,
          worktreePath,
          branchName,
          card,
          tracker,
        );
      }

      const verifyCommands = await detectVerificationCommands(worktreePath, {
        testingEnabled: deps.settings?.testingEnabled,
      });
      if (verifyCommands.length > 0) {
        tracker.setPhase('Running verification');
        await tracker.flush();

        const verifyResult = await runVerificationCommands(worktreePath, verifyCommands, undefined, {
          runCommand: (command, cwd, timeoutMs) =>
            runWorkspaceCommand(deps.workspaceId, cwd, command, timeoutMs, { isolated: true }),
        });
        if (!verifyResult.success) {
          const failed = verifyResult.results.find((r) => !r.success);
          const errOutput = failed ? summarizeVerificationFailure(failed) : 'Unknown verification failure';
          return { success: false, error: `Pre-review verification failed:\n${errOutput}` };
        }
      }

      const reviewerLabel = revisionPass === 0 ? 'reviewer' : `reviewer (${revisionPass + 1})`;
      tracker.setPhase(revisionPass === 0 ? 'Reviewing changes' : `Re-reviewing changes (${revisionPass + 1})`);
      tracker.addAgent(reviewerLabel);
      await tracker.flush();

      let submittedReview: ReviewResult | null = null;
      const rawReview = await deps.subagentManager.runSingleStructured({
        agent: 'reviewer',
        task: buildReviewPrompt(card, diff, fileSummary, reviewOpts),
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
        return { success: false, error: `Reviewer failed: ${rawReview.error}` };
      }

      const review = submittedReview ?? parseReviewResult(rawReview.response, card.title);
      tracker.completeAgent(reviewerLabel);

      const reviewFailure = requiresReviewerApproval()
        ? getBlockingReviewFailure(review)
        : null;
      const criticalIssues = getCriticalIssues(review);

      if (!reviewFailure) {
        await saveCachedReview(reviewFile, review);
        console.log(`[review-executor] Saved review to ${reviewRelPath}`);
        return pushAndCreatePr(
          deps.workspaceId,
          review,
          reviewRelPath,
          worktreePath,
          branchName,
          card,
          tracker,
        );
      }

      if (revisionPass >= MAX_CRITICAL_REVISIONS || criticalIssues.length === 0) {
        await saveCachedReview(reviewFile, review);
        console.log(`[review-executor] Saved review to ${reviewRelPath}`);
        return { success: false, error: reviewFailure };
      }

      const reviserLabel = `implementer (${revisionPass + 1})`;
      tracker.setPhase(`Fixing critical review feedback (${revisionPass + 1}/${MAX_CRITICAL_REVISIONS})`);
      tracker.addAgent(reviserLabel);
      await tracker.flush();

      const revisionResult = await deps.subagentManager.runSingleStructured({
        agent: 'implementer',
        task: buildReviewRevisionPrompt(card, criticalIssues, review.summary, {
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
        return { success: false, error: `Critical review revision failed: ${revisionResult.error}` };
      }
    }

    return { success: false, error: 'Review failed to produce a final result.' };
  } finally {
    detachLiveOutput();
  }
}

// ── Push + PR (shared by fresh run and resume) ──────────────

async function pushAndCreatePr(
  workspaceId: string,
  review: ReviewResult,
  reviewRelPath: string,
  worktreePath: string,
  branchName: string,
  card: Pick<Card, 'id' | 'title'>,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  // ── Step 3: Push branch ───────────────────────────────
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

  // ── Step 4: Create PR ────────────────────────────────
  tracker.setPhase('Creating PR');
  await tracker.flush();

  const baseBranch = await ensureRemoteDefaultBranch(worktreePath);

  const prResult = await createPrFromWorktree(worktreePath, {
    title: review.prTitle,
    body: review.prBody,
    baseBranch,
  });

  if (prResult.success) {
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
    // Worktrees are kept alive until the user explicitly cleans up
    // (via done cleanup) — never auto-delete work that hasn't been confirmed
    return {
      success: true,
      prUrl: prResult.url,
      prNumber: prResult.number,
      previewServerId: preview.previewServerId,
      previewUrl: preview.previewUrl,
      reviewFilePath: reviewRelPath,
    };
  }

  return {
    success: false,
    reviewFilePath: reviewRelPath,
    error: `PR creation failed: ${prResult.error}`,
  };
}

// ── Resume from cached review ───────────────────────────────

/**
 * Skip the expensive diff + subagent steps and go straight to push/PR.
 */
async function resumeFromReview(
  workspaceId: string,
  review: ReviewResult,
  reviewRelPath: string,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  // Synthesise a minimal card for push logging
  const cardStub = { id: path.basename(worktreePath).replace('card-', ''), title: '' };
  return pushAndCreatePr(
    workspaceId,
    review,
    reviewRelPath,
    worktreePath,
    branchName,
    cardStub,
    tracker,
  );
}
