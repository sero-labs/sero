/**
 * Pure loop lifecycle transitions.
 *
 * Lifecycle is generic and separate from step outcomes
 * (see 03-execution-and-scheduling.md). These helpers validate a requested
 * transition and return the updated loop or a clear error. They never start
 * steps — that is the coordinator's job.
 */

import type { Loop, LoopStatus } from '../shared/types';

export interface TransitionResult {
  ok: boolean;
  loop?: Loop;
  error?: string;
}

// `complete` is the only terminal status. `disabled` is an off switch the user
// can turn back on with `enable`, so it is NOT terminal.
const TERMINAL: LoopStatus[] = ['complete'];

function withStatus(loop: Loop, status: LoopStatus, now: string): Loop {
  return { ...loop, status, updatedAt: now };
}

export function canActivate(loop: Loop): boolean {
  return loop.status === 'draft';
}

/** draft -> active. */
export function activate(loop: Loop, now: string): TransitionResult {
  if (loop.status === 'active') return { ok: true, loop };
  if (!canActivate(loop)) {
    return { ok: false, error: `Cannot activate a loop in status "${loop.status}".` };
  }
  return { ok: true, loop: withStatus(loop, 'active', now) };
}

/**
 * any non-complete -> disabled. The off switch: the coordinator first aborts any
 * in-flight run (killing active subagents), then this marks the loop disabled
 * and clears its active run so scheduled triggers stop firing until re-enabled.
 */
export function disable(loop: Loop, now: string): TransitionResult {
  if (loop.status === 'disabled') return { ok: true, loop };
  if (loop.status === 'complete') {
    return { ok: false, error: 'Cannot disable a completed loop.' };
  }
  const cleared = { ...loop, runtime: { ...loop.runtime, activeRunId: undefined } };
  return { ok: true, loop: withStatus(cleared, 'disabled', now) };
}

/** disabled | blocked -> active, clearing any block so the coordinator re-evaluates. */
export function enable(loop: Loop, now: string): TransitionResult {
  if (loop.status === 'active') return { ok: true, loop };
  if (loop.status !== 'disabled' && loop.status !== 'blocked') {
    return { ok: false, error: `Cannot enable a loop in status "${loop.status}".` };
  }
  const cleared = { ...loop, runtime: { ...loop.runtime, block: undefined } };
  return { ok: true, loop: withStatus(cleared, 'active', now) };
}

export function isTerminal(status: LoopStatus): boolean {
  return TERMINAL.includes(status);
}
