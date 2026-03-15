/**
 * ReviewExecutor — runs the review phase for a kanban card.
 *
 * Handles: diff generation, reviewer subagent, branch push, PR creation.
 * The expensive reviewer result is cached to a JSON file so restarts
 * can resume from push/PR without re-running the subagent.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

import type { Card } from './types';
import type { ReviewProgressTracker } from './review-progress';
import type { ReviewResult, ReviewIssue } from './prompts';
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
import {
  createCheckpointInWorktree,
  ensureRemoteDefaultBranch,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
  createPrFromWorktree,
} from './worktree-git';
import { getContract } from './contracts';
import type { SubagentManager } from '../subagent/index';

const execFileAsync = promisify(execFile);
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

    // ── Try to load cached review ──────────────────────────
    console.log(`[review-executor] Checking for cached review at ${reviewFile}`);
    const cached = await loadCachedReview(reviewFile);
    if (cached) {
      console.log(`[review-executor] Resuming from cached review for card #${card.id} — skipping to push`);
      return resumeFromReview(cached, reviewRelPath, worktreePath, branchName, tracker);
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
    const verifyCommands = await detectVerificationCommands(worktreePath, {
      testingEnabled: deps.settings?.testingEnabled,
    });
    const reviewOpts: ReviewPromptOptions = { testingEnabled: deps.settings?.testingEnabled };

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

      const rawReview = await deps.subagentManager.runSingleStructured({
        agent: 'reviewer',
        task: buildReviewPrompt(card, diff, fileSummary, reviewOpts),
        parentSessionId,
        workspaceId: deps.workspaceId,
        cwd: worktreePath,
        isolated: true,
        onUpdate: (text) => tracker.addLogLine(text),
      });
      if (rawReview.error) {
        tracker.completeAgent(reviewerLabel, 'failed');
        return { success: false, error: `Reviewer failed: ${rawReview.error}` };
      }

      const review = parseReviewResult(rawReview.response, card.title);
      tracker.completeAgent(reviewerLabel);

      const reviewFailure = requiresReviewerApproval()
        ? getBlockingReviewFailure(review)
        : null;
      const criticalIssues = getCriticalIssues(review);

      if (!reviewFailure) {
        await saveCachedReview(reviewFile, review);
        console.log(`[review-executor] Saved review to ${reviewRelPath}`);
        return pushAndCreatePr(review, reviewRelPath, worktreePath, branchName, card, tracker);
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
        task: buildReviewRevisionPrompt(card, criticalIssues, review.summary),
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
    // Worktrees are kept alive until the user explicitly cleans up
    // (via done cleanup) — never auto-delete work that hasn't been confirmed
    return {
      success: true,
      prUrl: prResult.url,
      prNumber: prResult.number,
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
  review: ReviewResult,
  reviewRelPath: string,
  worktreePath: string,
  branchName: string,
  tracker: ReviewProgressTracker,
): Promise<ReviewExecutorResult> {
  // Synthesise a minimal card for push logging
  const cardStub = { id: path.basename(worktreePath).replace('card-', ''), title: '' };
  return pushAndCreatePr(review, reviewRelPath, worktreePath, branchName, cardStub, tracker);
}

// ── Review file cache ───────────────────────────────────────

async function loadCachedReview(filePath: string): Promise<ReviewResult | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as Partial<ReviewResult>;
    if (typeof data.prTitle === 'string' && typeof data.prBody === 'string' && !hasMalformedLegacyIssues(data)) {
      const review = data as ReviewResult;
      return getBlockingReviewFailure(review) ? null : review;
    }
  } catch {
    // No cached review or invalid file — run from scratch
  }
  return null;
}

async function saveCachedReview(filePath: string, review: ReviewResult): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(review, null, 2), 'utf8');
}

function hasMalformedLegacyIssues(review: Partial<ReviewResult>): boolean {
  return Array.isArray(review.issues)
    && review.issues.some((issue) => (
      typeof issue !== 'string'
      || issue.includes('[object Object]')
    ));
}

function getBlockingReviewFailure(review: ReviewResult): string | null {
  const criticalIssues = review.categorizedIssues?.filter((issue) => issue.severity === 'critical') ?? [];
  const verdictBlocks = review.verdict === 'fix-first' || review.verdict === 'reject';
  const reviewBlocks = review.approved === false || verdictBlocks || criticalIssues.length > 0;

  if (!reviewBlocks) return null;

  const issueLines = criticalIssues.length > 0
    ? criticalIssues
      .slice(0, 3)
      .map((issue) => {
        const location = issue.file
          ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})`
          : '';
        return `- ${issue.description}${location}`;
      })
      .join('\n')
    : review.issues.slice(0, 3).map((issue) => `- ${issue}`).join('\n');

  const summary = review.summary.trim() || 'Reviewer did not approve this implementation.';
  return issueLines ? `${summary}\n${issueLines}` : summary;
}

function requiresReviewerApproval(): boolean {
  return getContract('in-progress', 'review')?.qualityGates.some((gate) => (
    gate.type === 'agent-review'
    && gate.agent === 'reviewer'
    && gate.blocking
  )) === true;
}

function getCriticalIssues(review: ReviewResult): ReviewIssue[] {
  return review.categorizedIssues?.filter((issue) => issue.severity === 'critical') ?? [];
}

// ── Orphaned-file recovery ──────────────────────────────────

/**
 * Detect files that were written to the workspace root instead of
 * the worktree (legacy CWD bug) and copy them into the worktree.
 *
 * Worktree pattern: `<workspace>/.sero/worktrees/card-<id>`
 * so `path.resolve(worktreePath, '../../..')` gives the workspace root.
 *
 * @returns true if any files were recovered.
 */
async function recoverWorkspaceRootChanges(
  worktreePath: string,
  opts?: { expectedPaths?: string[]; allowAllDirty?: boolean },
): Promise<boolean> {
  const workspaceRoot = path.resolve(worktreePath, '..', '..', '..');

  try {
    await fs.access(path.join(workspaceRoot, '.git'));
  } catch {
    return false;
  }

  let statusRaw: string;
  try {
    const result = await execFileAsync(
      'git', ['status', '--porcelain', '--untracked-files=all'],
      { cwd: workspaceRoot, timeout: 15_000 },
    );
    statusRaw = result.stdout.trim();
  } catch {
    return false;
  }

  if (!statusRaw) return false;

  const expectedPathSet = new Set(opts?.expectedPaths ?? []);
  const dirtyFiles = statusRaw
    .split('\n')
    .map((line) => parseStatusPath(line))
    .filter((filePath): filePath is string => !!filePath)
    .filter((filePath) => !filePath.startsWith('.sero/'))
    .filter((filePath) => (
      opts?.allowAllDirty
      || expectedPathSet.size === 0
      || expectedPathSet.has(filePath)
    ));

  if (dirtyFiles.length === 0) return false;

  console.log(
    `[review-executor] Recovering ${dirtyFiles.length} workspace file(s) into worktree`,
  );

  for (const relFile of dirtyFiles) {
    const src = path.join(workspaceRoot, relFile);
    const dest = path.join(worktreePath, relFile);
    try {
      const sourceStat = await fs.stat(src).catch(() => null);
      if (!sourceStat) {
        await fs.rm(dest, { force: true });
        continue;
      }
      if (!sourceStat.isFile()) continue;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    } catch (err: unknown) {
      console.warn(`[review-executor] Failed to copy ${relFile}:`, (err as Error)?.message);
    }
  }

  return true;
}

function parseStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pathPart = line.slice(3).trim();
  if (!pathPart) return null;
  if (pathPart.includes(' -> ')) {
    const [, dest] = pathPart.split(' -> ');
    return dest?.trim() || null;
  }
  return pathPart;
}
