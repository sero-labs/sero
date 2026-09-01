/**
 * User-initiated restart/retry actions, split out of coordinator.ts (500-LOC
 * limit). They reach back into the coordinator through the same narrow
 * `CoordinatorRunSeam` event delivery uses, so the coordinator stays the only
 * component that starts runs.
 */

import type { Loop, OrchestratorActionResult } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { CoordinatorRunSeam } from './event-delivery';
import { cleanupPreviousWorktree } from './worktree-cleanup';
import { rearmLoop, reenableSchedule } from './scheduler';
import { hasRunningSteps } from './readiness';
import { retryStep, retryStuckLoop } from './recovery-apply';

/**
 * Restart: re-run the whole plan from the first step. Re-arms every step
 * (back to pending, attempts cleared, run context and block/completion cleared),
 * cleans up the previous worktree and any safely merged local branch, re-enables
 * schedule, sets the loop active, and runs a fresh pass now.
 *
 * Available from any loop the user might want to restart — completed, blocked,
 * or disabled (and an idle active loop) — so a loop is never a dead end: a
 * blocked loop can be re-run to make a different choice this time. Refused only
 * for a never-started draft (use Activate) or while a run is in flight.
 */
export async function runAgain(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
): Promise<OrchestratorActionResult> {
  const loop = await seam.findLoop(loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
  if (loop.status === 'draft') {
    return { ok: false, error: 'This loop has not started yet — use Activate.' };
  }
  if (loop.runtime.activeRunId || hasRunningSteps(loop)) {
    return { ok: false, error: 'A run is already in progress — disable it first, then restart.' };
  }
  const now = host.now();
  const cleanup = await cleanupPreviousWorktree(host, loopId, loop.runtime.workspace.resolved);
  if (!cleanup.removed) return { ok: false, error: cleanup.error };
  const reactivated: Loop = {
    ...rearmLoop({ ...loop, triggers: reenableSchedule(loop, now) }, now),
    status: 'active',
  };
  await seam.replaceLoop(reactivated);
  return seam.runNext(loopId, reactivated);
}

/**
 * User-initiated retry of a stuck loop: resets its blocked/failed steps,
 * clears the block, and runs the next ready step. Refuses while a run is in
 * flight or when there is nothing to recover.
 */
export async function retryLoop(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
): Promise<OrchestratorActionResult> {
  const loop = await seam.findLoop(loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
  if (loop.runtime.activeRunId || hasRunningSteps(loop)) {
    return { ok: false, error: 'A run is already in progress.' };
  }
  const retried = retryStuckLoop(loop, host.now());
  if (!retried) return { ok: false, error: 'Nothing to retry — no blocked or failed steps.' };
  await seam.replaceLoop(retried);
  return seam.runNext(loopId, retried);
}

/**
 * Retries a single blocked/failed step: resets that step (fresh attempt budget),
 * clears the loop block, reactivates, and runs the loop on from there. Other
 * steps are untouched, so finished work is never redone.
 */
export async function retryStepAction(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
  stepId: string,
): Promise<OrchestratorActionResult> {
  const loop = await seam.findLoop(loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
  if (loop.runtime.activeRunId || hasRunningSteps(loop)) {
    return { ok: false, error: 'A run is already in progress.' };
  }
  const retried = retryStep(loop, stepId, host.now());
  if (!retried) return { ok: false, error: `Step "${stepId}" is not blocked or failed.` };
  await seam.replaceLoop(retried);
  return seam.runNext(loopId, retried);
}
