/**
 * Outcome notifications — nudges the user when a run leaves a loop in a terminal
 * state without a pending question (a question already notifies via `notifyAsked`
 * in human-input.ts). Reuses the same `host.notify` seam; no new infrastructure.
 *
 * The run engine calls this once, at `finalize`. A run only executes from an
 * `active` loop and a terminal (complete/blocked) loop cannot start another run,
 * so "fired at finalize" == "fired once per transition" — re-persisting the same
 * state never goes through here, so it never re-notifies.
 */

import { WORKFLOW_LABEL } from '../shared/labels';
import type { Loop } from '../shared/types';
import type { OrchestratorHost } from './host';

export interface OutcomeNotification {
  message: string;
  level: 'info' | 'warning';
}

/**
 * The notification to emit for a just-finalized loop, or null when the run did
 * not reach a terminal outcome (still active/draft/disabled — nothing to report).
 * Pure, so the transition logic is unit-tested without a host.
 */
export function outcomeNotification(loop: Loop): OutcomeNotification | null {
  if (loop.status === 'complete') {
    const receipt = loop.runtime.completion?.receipt;
    const delivered = receipt ? ` Delivered: ${receipt.summary} (${receipt.ref}).` : '';
    return { message: `${WORKFLOW_LABEL} "${loop.title}" finished.${delivered}`, level: 'info' };
  }
  if (loop.status === 'blocked') {
    const reason = loop.runtime.block?.reason?.trim();
    return { message: `${WORKFLOW_LABEL} "${loop.title}" is blocked${reason ? ` — ${reason}` : ''}.`, level: 'warning' };
  }
  return null;
}

/** Emits the outcome notification (info on complete, warning on blocked) if any. */
export function notifyOutcome(host: OrchestratorHost, loop: Loop): void {
  const notification = outcomeNotification(loop);
  if (notification) host.notify(notification.message, notification.level);
}
