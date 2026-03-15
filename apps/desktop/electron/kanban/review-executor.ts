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
import type { ReviewResult } from './prompts';
import {
  buildReviewPrompt,
  parseReviewResult,
} from './prompts';
import type { ReviewPromptOptions } from './prompts';
import { detectVerificationCommands, runVerificationCommands } from './verification';
import type { KanbanSettings } from './types';
import {
  createCheckpointInWorktree,
  ensureRemoteDefaultBranch,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
  createPrFromWorktree,
} from './worktree-git';
import type { SubagentManager } from '../subagent/index';

const execFileAsync = promisify(execFile);

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

  // ── Step 1: Check diff ─────────────────────────────────
  tracker.setPhase('Checking changes');
  await tracker.flush();

  await createCheckpointInWorktree(worktreePath, `feat: ${card.title}`);

  let [diff, fileSummary] = await Promise.all([
    getWorktreeDiff(worktreePath),
    getWorktreeDiffSummary(worktreePath),
  ]);

  // Recovery: files may have landed in the workspace root (legacy CWD bug)
  if (!diff.trim()) {
    tracker.setPhase('Recovering files');
    await tracker.flush();

    const recovered = await recoverOrphanedFiles(worktreePath);
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

  // ── Step 1b: Pre-review verification ────────────────────
  const verifyCommands = await detectVerificationCommands(worktreePath, {
    testingEnabled: deps.settings?.testingEnabled,
  });
  if (verifyCommands.length > 0) {
    tracker.setPhase('Running verification');
    await tracker.flush();

    const verifyResult = await runVerificationCommands(worktreePath, verifyCommands);
    if (!verifyResult.success) {
      const failed = verifyResult.results.find((r) => !r.success);
      const errOutput = failed
        ? `${failed.command}: ${failed.stderr}\n${failed.stdout}`.trim().slice(-2000)
        : 'Unknown verification failure';
      return { success: false, error: `Pre-review verification failed:\n${errOutput}` };
    }
  }

  // ── Step 2: Reviewer subagent ─────────────────────────
  tracker.setPhase('Reviewing changes');
  tracker.addAgent('reviewer');
  await tracker.flush();

  const reviewOpts: ReviewPromptOptions = { testingEnabled: deps.settings?.testingEnabled };
  const reviewPrompt = buildReviewPrompt(card, diff, fileSummary, reviewOpts);
  // Uses the reviewer agent template (packages/templates/agents/reviewer.md)
  const rawReview = await deps.subagentManager.runSingle({
    agent: 'reviewer',
    task: reviewPrompt,
    parentSessionId: `kanban-review-${card.id}`,
    workspaceId: deps.workspaceId,
    cwd: worktreePath,
    isolated: true,
    onUpdate: (text) => tracker.addLogLine(text),
  });

  const review = parseReviewResult(rawReview, card.title);
  tracker.completeAgent('reviewer');

  // Save review to file so restarts can skip re-running the subagent
  await saveCachedReview(reviewFile, review);
  console.log(`[review-executor] Saved review to ${reviewRelPath}`);

  // ── Steps 3–4: Push + PR ──────────────────────────────
  return pushAndCreatePr(review, reviewRelPath, worktreePath, branchName, card, tracker);
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
    if (typeof data.prTitle === 'string' && typeof data.prBody === 'string') {
      return data as ReviewResult;
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
async function recoverOrphanedFiles(worktreePath: string): Promise<boolean> {
  const workspaceRoot = path.resolve(worktreePath, '..', '..', '..');

  try {
    await fs.access(path.join(workspaceRoot, '.git'));
  } catch {
    return false;
  }

  let untrackedRaw: string;
  try {
    const result = await execFileAsync(
      'git', ['ls-files', '--others', '--exclude-standard'],
      { cwd: workspaceRoot, timeout: 15_000 },
    );
    untrackedRaw = result.stdout.trim();
  } catch {
    return false;
  }

  if (!untrackedRaw) return false;

  const orphaned = untrackedRaw
    .split('\n')
    .filter((f) => f && !f.startsWith('.sero/'));

  if (orphaned.length === 0) return false;

  console.log(
    `[review-executor] Recovering ${orphaned.length} orphaned file(s) from workspace root to worktree`,
  );

  for (const relFile of orphaned) {
    const src = path.join(workspaceRoot, relFile);
    const dest = path.join(worktreePath, relFile);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    } catch (err: unknown) {
      console.warn(`[review-executor] Failed to copy ${relFile}:`, (err as Error)?.message);
    }
  }

  return true;
}
