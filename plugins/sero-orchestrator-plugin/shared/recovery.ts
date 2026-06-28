/**
 * Pure helpers for recovering a stuck loop. Shared by the runtime (which resets
 * the steps) and the UI (which decides whether to show the Retry control), so the
 * "is this loop retryable?" rule lives in exactly one place.
 */

import type { Loop, StepStatus } from './types';

/** Step states a Retry resets back to pending. */
export const RECOVERABLE_STEP_STATUSES: ReadonlySet<StepStatus> = new Set([
  'blocked',
  'failed',
  'needs-revision',
]);

/**
 * True when a loop has something to recover: a blocked/failed step, a runtime
 * block, or a blocked completion. Drives the Retry control's visibility and the
 * runtime's retry guard.
 */
export function isRetryableLoop(loop: Loop): boolean {
  if (loop.runtime.block) return true;
  if (loop.runtime.completion?.status === 'blocked') return true;
  return Object.values(loop.runtime.stepStates).some((s) =>
    RECOVERABLE_STEP_STATUSES.has(s.status),
  );
}
