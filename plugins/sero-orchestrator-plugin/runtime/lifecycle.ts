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

const TERMINAL: LoopStatus[] = ['complete', 'stopped'];

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

/** active -> paused. */
export function pause(loop: Loop, now: string): TransitionResult {
  if (loop.status === 'paused') return { ok: true, loop };
  if (loop.status !== 'active') {
    return { ok: false, error: `Cannot pause a loop in status "${loop.status}".` };
  }
  return { ok: true, loop: withStatus(loop, 'paused', now) };
}

/** paused -> active. Also recovers a blocked loop back to active. */
export function resume(loop: Loop, now: string): TransitionResult {
  if (loop.status === 'active') return { ok: true, loop };
  if (loop.status !== 'paused' && loop.status !== 'blocked') {
    return { ok: false, error: `Cannot resume a loop in status "${loop.status}".` };
  }
  // Resuming clears a previous block so the coordinator can re-evaluate.
  const cleared = loop.status === 'blocked'
    ? { ...loop, runtime: { ...loop.runtime, block: undefined } }
    : loop;
  return { ok: true, loop: withStatus(cleared, 'active', now) };
}

/** any non-terminal -> stopped. */
export function stop(loop: Loop, now: string): TransitionResult {
  if (loop.status === 'stopped') return { ok: true, loop };
  if (TERMINAL.includes(loop.status)) {
    return { ok: false, error: `Cannot stop a loop in status "${loop.status}".` };
  }
  return { ok: true, loop: withStatus(loop, 'stopped', now) };
}

export function isTerminal(status: LoopStatus): boolean {
  return TERMINAL.includes(status);
}
