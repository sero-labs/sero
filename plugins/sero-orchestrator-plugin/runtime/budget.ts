// Run-budget enforcement (D-17). `maxAttempts` bounds count; `RunBudget` bounds
// cost and blast radius. Consumption is DERIVED by summing attempt records — no
// separate counter (Principle 3). Pure functions over loop state so the engine
// can evaluate them inside a single state mutator.
//
//   • Cumulative (per loop): wall-clock / tokens / cost → `blocked:
//     budget-exhausted`, recoverable by raising the limit.
//   • Per attempt: `maxChangedFiles` → block for review with changes kept;
//     `maxAttemptWallClockMs` → the hard per-attempt timeout (min'd with the
//     remaining cumulative wall-clock).
//   • Per command: `maxCommandRuntimeMs` → default timeout for every check.
//
// Token/cost summing is wired here now; background-worker usage populates it in
// Phase 3. Active-session turns are attributed best-effort from the turn result.

import type { LoopAttempt, LoopGoal, RunBudget } from '../shared/types';

function attemptDurationMs(attempt: LoopAttempt): number {
  if (!attempt.endedAt) return 0;
  const start = Date.parse(attempt.startedAt);
  const end = Date.parse(attempt.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

export function cumulativeWallClockMs(loop: LoopGoal): number {
  return loop.attempts.reduce((sum, attempt) => sum + attemptDurationMs(attempt), 0);
}

export function cumulativeTokens(loop: LoopGoal): number {
  return loop.attempts.reduce((sum, attempt) => sum + (attempt.usage?.totalTokens ?? 0), 0);
}

// Cost needs provider pricing; it wires in with worker usage in Phase 3. Until
// then there is no recorded cost, so cumulative cost is 0.
export function cumulativeCostUsd(_loop: LoopGoal): number {
  return 0;
}

/**
 * Whether a cumulative budget is already met. Checked before an attempt starts
 * and again after it completes; on a hit the loop blocks `budget-exhausted`.
 */
export function cumulativeBudgetExhausted(loop: LoopGoal): boolean {
  const budget = loop.budget;
  if (!budget) return false;
  if (budget.maxWallClockMs != null && cumulativeWallClockMs(loop) >= budget.maxWallClockMs) {
    return true;
  }
  if (budget.maxTotalTokens != null && cumulativeTokens(loop) >= budget.maxTotalTokens) {
    return true;
  }
  if (budget.maxCostUsd != null && cumulativeCostUsd(loop) >= budget.maxCostUsd) {
    return true;
  }
  return false;
}

/**
 * Hard per-attempt timeout: the smaller of `maxAttemptWallClockMs` and the
 * remaining cumulative wall-clock. Undefined when neither bound is set.
 */
export function attemptTimeoutMs(loop: LoopGoal): number | undefined {
  const budget = loop.budget;
  if (!budget) return undefined;
  const perAttempt = budget.maxAttemptWallClockMs;
  if (budget.maxWallClockMs == null) return perAttempt;
  const remaining = Math.max(0, budget.maxWallClockMs - cumulativeWallClockMs(loop));
  if (perAttempt == null) return remaining;
  return Math.min(perAttempt, remaining);
}

export function commandTimeoutMs(budget: RunBudget | undefined): number | undefined {
  return budget?.maxCommandRuntimeMs;
}

/** Per-attempt blast-radius gate: a diff over `maxChangedFiles` blocks for review. */
export function changedFilesExceeded(
  budget: RunBudget | undefined,
  changedFiles: string[],
): boolean {
  if (!budget || budget.maxChangedFiles == null) return false;
  return changedFiles.length > budget.maxChangedFiles;
}
