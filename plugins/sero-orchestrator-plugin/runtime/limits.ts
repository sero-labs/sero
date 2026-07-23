/**
 * Management limit enforcement (D-05, FR-08). When a limit is reached the
 * Orchestrator stops starting new attempts and blocks the loop with
 * `LoopBlock.kind = "management-limit"`. Limit exhaustion is NOT completion.
 *
 * Per-step attempt limits are enforced in readiness; this module enforces the
 * loop-level limits checked before each batch starts.
 */

import type { Loop, LoopLimits, LoopRun } from '../shared/types';

export interface LimitCheck {
  ok: boolean;
  limit?: keyof LoopLimits;
  reason?: string;
}

const OK: LimitCheck = { ok: true };

function totalAttempts(loop: Loop, run: LoopRun): number {
  const projected = Object.values(loop.runtime.stepStates).reduce((sum, state) => sum + state.attempts, 0);
  // Count real work attempts from history (stepStates.attempts undercounts after a
  // feedback revisit resets it to 0), but exclude parks: an attempt that asked the
  // user is a deliberate pause, not a failed work attempt, and must not burn the
  // total-attempt budget — matching resetStepPending's per-step behaviour.
  const workAttempts = run.stepAttempts.reduce((sum, attempt) => sum + (attempt.outcome?.questions?.length ? 0 : 1), 0);
  return Math.max(projected, workAttempts);
}

function totalTokens(loop: Loop): number {
  return loop.runs.reduce(
    (sum, run) => sum + run.stepAttempts.reduce((s, a) => s + (a.usage?.totalTokens ?? 0), 0),
    0,
  );
}

function totalCost(loop: Loop): number {
  return loop.runs.reduce(
    (sum, run) => sum + run.stepAttempts.reduce((s, a) => s + (a.usage?.costUsd ?? 0), 0),
    0,
  );
}

/**
 * How many more work attempts the run may still start before `maxAttemptsTotal`
 * trips (Infinity when uncapped). A fan-out wave is capped to this so one wave of
 * up-to-maxConcurrency activations cannot overshoot the total-attempt budget —
 * the between-wave `checkManagementLimits` only catches an overshoot after it has
 * already happened.
 */
export function remainingAttemptBudget(loop: Loop, run: LoopRun): number {
  const max = loop.limits.maxAttemptsTotal;
  if (max === undefined) return Infinity;
  return Math.max(0, max - totalAttempts(loop, run));
}

/** Checks loop-level limits before starting another batch of attempts. */
export function checkManagementLimits(loop: Loop, run: LoopRun, nowMs: number): LimitCheck {
  const limits = loop.limits;

  if (limits.maxAttemptsTotal !== undefined && totalAttempts(loop, run) >= limits.maxAttemptsTotal) {
    return { ok: false, limit: 'maxAttemptsTotal', reason: `reached max total attempts (${limits.maxAttemptsTotal})` };
  }
  if (limits.maxWallClockMs !== undefined) {
    const elapsed = nowMs - Date.parse(run.startedAt);
    if (elapsed >= limits.maxWallClockMs) {
      return { ok: false, limit: 'maxWallClockMs', reason: `reached max wall-clock (${limits.maxWallClockMs}ms)` };
    }
  }
  if (limits.maxTotalTokens !== undefined && totalTokens(loop) >= limits.maxTotalTokens) {
    return { ok: false, limit: 'maxTotalTokens', reason: `reached max total tokens (${limits.maxTotalTokens})` };
  }
  if (limits.maxCostUsd !== undefined && totalCost(loop) >= limits.maxCostUsd) {
    return { ok: false, limit: 'maxCostUsd', reason: `reached max cost ($${limits.maxCostUsd})` };
  }
  return OK;
}
