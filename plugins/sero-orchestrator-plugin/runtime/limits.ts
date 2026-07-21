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
  return Math.max(projected, run.stepAttempts.length);
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
