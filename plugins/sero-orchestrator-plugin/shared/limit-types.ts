/**
 * What a Workflow limits itself to.
 *
 * Every field is optional: an unset limit means the Workflow is uncapped for
 * that dimension, not that it is capped at zero.
 *
 * Split out of types.ts (500-LOC limit); re-exported from there.
 */

export interface LoopLimits {
  maxAttemptsPerStep?: number;
  maxAttemptsTotal?: number;
  maxConcurrentSteps?: number;
  maxWallClockMs?: number;
  maxTotalTokens?: number;
  maxCostUsd?: number;
}
