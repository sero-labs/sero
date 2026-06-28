/**
 * Pure helpers for recovering a stuck loop. Shared by the runtime (which resets
 * the steps) and the UI (which decides whether to show the Retry control), so the
 * "is this loop retryable?" rule lives in exactly one place.
 */

import type { Loop, LoopStepDefinition, StepRuntimeState, StepStatus } from './types';

/** Step states a Retry resets back to pending. */
export const RECOVERABLE_STEP_STATUSES: ReadonlySet<StepStatus> = new Set([
  'blocked',
  'failed',
  'needs-revision',
]);

/** Effective per-step attempt cap (a step override, else the loop limit). */
export function stepAttemptCap(loop: Loop, step: LoopStepDefinition): number | undefined {
  return step.maxAttempts ?? loop.limits.maxAttemptsPerStep;
}

/**
 * A step the engine will never start even though it is logically runnable: its
 * status is pending/ready but it has already used its per-step attempt budget.
 * A small `maxAttemptsPerStep` combined with any reset-to-pending (a recovery
 * retry, a revision, an answered question) leaves a step here — the step looks
 * runnable but readiness skips it forever — so a user Retry must rescue it by
 * restoring its attempt count.
 */
export function isStuckOnAttempts(loop: Loop, step: LoopStepDefinition, state: StepRuntimeState): boolean {
  if (state.status !== 'pending' && state.status !== 'ready') return false;
  const cap = stepAttemptCap(loop, step);
  return cap !== undefined && state.attempts >= cap;
}

/**
 * True when a loop has something to recover: a blocked/failed step, a runtime
 * block, a blocked completion, or a step stuck on its attempt budget. Drives the
 * Retry control's visibility and the runtime's retry guard.
 */
export function isRetryableLoop(loop: Loop): boolean {
  if (loop.runtime.block) return true;
  if (loop.runtime.completion?.status === 'blocked') return true;
  return loop.plan.steps.some((step) => {
    const state = loop.runtime.stepStates[step.id];
    if (!state) return false;
    return RECOVERABLE_STEP_STATUSES.has(state.status) || isStuckOnAttempts(loop, step, state);
  });
}
