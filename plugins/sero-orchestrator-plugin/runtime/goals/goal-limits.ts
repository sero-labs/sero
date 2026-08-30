/**
 * Goal budget checks (rule 6). Automatic turns, tokens, cost and elapsed active
 * time are separate axes, and reaching any one of them is `limited`, never
 * `complete`.
 *
 * A token or cost budget bounds the goal's own TURNS. It is not a guaranteed
 * spend ceiling: one turn can run a long tool loop before the budget is checked
 * again. Callers must say that rather than imply a hard cap.
 */

import type { Goal, GoalLimitKey } from '../../shared/goal-types';

export type GoalLimitCheck = { ok: true } | { ok: false; limit: GoalLimitKey; reason: string };

const OK: GoalLimitCheck = { ok: true };

/**
 * Active time including the span in progress. `usage.activeMs` is only folded
 * in when a span ends, so a goal that never leaves `active` would otherwise
 * never reach its wall-clock budget.
 */
export function elapsedActiveMs(goal: Goal, nowMs: number): number {
  const open = goal.activeSince ? Math.max(0, nowMs - Date.parse(goal.activeSince)) : 0;
  return goal.usage.activeMs + open;
}

/** Checks every budget before the goal is allowed another automatic turn. */
export function checkGoalLimits(goal: Goal, nowMs: number): GoalLimitCheck {
  const { limits, usage } = goal;
  if (limits.maxAttemptsTotal !== undefined && usage.automaticTurns >= limits.maxAttemptsTotal) {
    return {
      ok: false,
      limit: 'maxAttemptsTotal',
      reason: `used all ${limits.maxAttemptsTotal} automatic turns`,
    };
  }
  if (limits.maxWallClockMs !== undefined && elapsedActiveMs(goal, nowMs) >= limits.maxWallClockMs) {
    return {
      ok: false,
      limit: 'maxWallClockMs',
      reason: `reached the active-time budget of ${Math.round(limits.maxWallClockMs / 60_000)} minute(s)`,
    };
  }
  if (limits.maxTotalTokens !== undefined && usage.totalTokens >= limits.maxTotalTokens) {
    return { ok: false, limit: 'maxTotalTokens', reason: `reached the token budget of ${limits.maxTotalTokens}` };
  }
  if (limits.maxCostUsd !== undefined && usage.costUsd >= limits.maxCostUsd) {
    return { ok: false, limit: 'maxCostUsd', reason: `reached the cost budget of $${limits.maxCostUsd.toFixed(2)}` };
  }
  return OK;
}
