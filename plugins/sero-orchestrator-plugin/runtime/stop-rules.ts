// Stop-rule evaluation (D-13). Pure functions over loop state — the engine runs
// them inside a single state mutator to decide a loop's next state after an
// attempt. A loop stops/blocks on: required checks pass (success); a budget
// limit (D-17); no-progress over the threshold; or `maxAttempts`. Pause/stop are
// user actions handled in the coordinator, not here.

import { cumulativeBudgetExhausted } from './budget';
import type {
  BlockedReason,
  CheckResult,
  LoopAttempt,
  LoopCheck,
  LoopGoal,
  SuccessCriterion,
} from '../shared/types';

/** All required checks passed (positional pairing: `results[i]` ↔ `checks[i]`). */
export function requiredChecksPassed(
  checks: LoopCheck[],
  results: CheckResult[],
): boolean {
  return checks.every((check, index) => {
    if (!check.required) return true;
    return results[index]?.status === 'passed';
  });
}

/**
 * All required criteria passed (spec 05). Positional pairing: `results[i]` ↔
 * `criteria[i]` (criteria.ts evaluates in order). A required criterion that is
 * skipped or failed gates completion, so the loop never "completes" on an
 * unevaluated criterion.
 */
export function requiredCriteriaPassed(
  criteria: SuccessCriterion[],
  results: CheckResult[],
): boolean {
  return criteria.every((criterion, index) => {
    if (!criterion.required) return true;
    return results[index]?.status === 'passed';
  });
}

interface AttemptSignature {
  failing: string;
  files: string;
  fingerprint: string;
}

function signatureOf(attempt: LoopAttempt): AttemptSignature {
  const failing = attempt.checkResults
    .filter((result) => result.status === 'failed')
    .map((result) => result.checkId)
    .sort()
    .join('|');
  const files = [...attempt.changedFiles].sort().join('|');
  // When no explicit diff hash exists, the changed-file set is the proxy.
  const fingerprint = attempt.diffFingerprint ?? files;
  return { failing, files, fingerprint };
}

/**
 * No measurable progress over the last `stopOnNoProgressAttempts` failed
 * attempts: every attempt in the window is equivalent to the most recent under
 * the enabled comparators (failing checks / changed files / diff fingerprint).
 * Empty diffs compare equal, so a run of empty-diff attempts trips this too.
 */
export function isNoProgress(loop: LoopGoal): boolean {
  const threshold = loop.stopRule.stopOnNoProgressAttempts;
  const policy = loop.stopRule.noProgressPolicy;
  if (!threshold || threshold < 2 || !policy) return false;
  const anyComparator =
    policy.compareFailedChecks || policy.compareChangedFiles || policy.compareDiffFingerprint;
  if (!anyComparator) return false;

  const failed = loop.attempts.filter((attempt) => attempt.status === 'failed');
  if (failed.length < threshold) return false;

  const window = failed.slice(failed.length - threshold);
  const base = signatureOf(window[window.length - 1]!);
  return window.every((attempt) => {
    const signature = signatureOf(attempt);
    if (policy.compareFailedChecks && signature.failing !== base.failing) return false;
    if (policy.compareChangedFiles && signature.files !== base.files) return false;
    if (policy.compareDiffFingerprint && signature.fingerprint !== base.fingerprint) return false;
    return true;
  });
}

export type LoopTransition =
  | { status: 'complete' }
  | { status: 'stopped'; reason: 'max-attempts' }
  | { status: 'blocked'; reason: BlockedReason }
  | { status: 'active' };

export interface EvaluateInput {
  loop: LoopGoal; // already contains the finalized attempt in `attempts`
  attempt: LoopAttempt;
  requiredPassed: boolean;
  changedFilesExceeded: boolean;
  /** This attempt ran past a no-progress block via an explicit override. */
  overrodeNoProgress: boolean;
}

/**
 * Decide the loop's next state after an attempt completes. Priority: a
 * changed-files block keeps the change for review; a passing attempt completes;
 * then cumulative budget, no-progress, and the attempt ceiling.
 */
export function evaluateAfterAttempt(input: EvaluateInput): LoopTransition {
  const { loop, attempt, requiredPassed } = input;

  if (input.changedFilesExceeded) {
    return { status: 'blocked', reason: 'changed-files-exceeded' };
  }
  if (requiredPassed && attempt.status === 'passed') {
    return { status: 'complete' };
  }
  if (cumulativeBudgetExhausted(loop)) {
    return { status: 'blocked', reason: 'budget-exhausted' };
  }
  if (!input.overrodeNoProgress && isNoProgress(loop)) {
    return { status: 'blocked', reason: 'no-progress' };
  }
  if (attempt.attemptNumber >= loop.stopRule.maxAttempts) {
    return { status: 'stopped', reason: 'max-attempts' };
  }
  return { status: 'active' };
}

const BLOCK_TEXT: Record<BlockedReason, string> = {
  'no-progress':
    'Blocked: no measurable progress over the last few attempts. Override no-progress to force one more run.',
  'budget-exhausted':
    'Blocked: the run budget is exhausted. Raise the budget and resume to continue.',
  'changed-files-exceeded':
    'Blocked for review: an attempt changed more files than the budget allows. The changes were kept.',
  unsafe: 'Blocked: the workspace is in an unsafe state.',
};

/** Plain-English status reason for a transition (UI/CLI facing). */
export function transitionReasonText(transition: LoopTransition): string | undefined {
  switch (transition.status) {
    case 'complete':
    case 'active':
      return undefined;
    case 'stopped':
      return 'Stopped: reached the maximum number of attempts.';
    case 'blocked':
      return BLOCK_TEXT[transition.reason];
  }
}

export function blockReasonText(reason: BlockedReason): string {
  return BLOCK_TEXT[reason];
}
