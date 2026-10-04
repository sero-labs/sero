/**
 * What a running step's live block watches.
 *
 * A step's work is done by a background agent or a model call, and the host
 * reports that run's id on the attempt. While the step's result, a recovery
 * choice or the stop condition is being checked, the step stays Running and
 * the block shows the check instead — the check's run id comes from the loop's
 * live-call record.
 *
 * A step that runs in the chat session has no block: the chat shows that work.
 */

import { feedbackActivity, type WorkFeedback } from '@sero-ai/common';
import type { LiveCall, Loop, LoopRun, StepStatus } from '../../shared/types';
import { freshness, waitLine } from './live-facts';

export interface StepLiveView {
  /** The run to watch. */
  runId: string;
  /** A quiet line that replaces the tool line while a check runs. */
  quietLabel?: string;
}

/** Where each check between steps says it is. */
const CHECK_LABELS: Partial<Record<LiveCall['kind'], string>> = {
  evaluator: 'checking the result',
  recovery: 'checking what to do next',
  stop: 'checking the stop condition',
};

/**
 * The live view for one step, or undefined when it has nothing to show.
 * `status` is the step's own runtime state, which is what a reader sees.
 *
 * The run is passed IN rather than read from `loop.runs`. The persisted
 * `loop.json` deliberately drops run history (`stripLoopForPersist`), so the
 * UI never has it: the caller watches the active run's own file and hands it
 * over. Reading `loop.runs` here searched an always-empty list and left every
 * running step without its live view.
 */
export function stepLiveView(
  loop: Loop,
  activeRun: LoopRun | null,
  stepId: string,
  status: StepStatus | undefined,
): StepLiveView | undefined {
  if (status !== 'running') return undefined;

  const call = loop.runtime.liveCall;
  if (call && call.stepId === stepId) {
    const quietLabel = CHECK_LABELS[call.kind];
    if (quietLabel) return { runId: call.runId, quietLabel };
  }

  const attempt = activeRun?.stepAttempts.find(
    (entry) => entry.stepId === stepId && entry.status === 'running' && entry.workerRunId,
  );
  return attempt?.workerRunId ? { runId: attempt.workerRunId } : undefined;
}

/** The id of the step's attempt that is running now, if the run file shows one. */
export function runningAttemptId(activeRun: LoopRun | null | undefined, stepId: string): string | undefined {
  return activeRun?.stepAttempts.find((entry) => entry.stepId === stepId && entry.status === 'running')?.id;
}

/** A call or a silence shorter than this is not named: the line would change several times a second. */
export const STEADY_MS = 10_000;

/**
 * What a running step or fan-out item reports now. Short model requests and
 * tool calls come and go too fast to read, so the line says `Working` and stays
 * still. It names the open call, and how long ago the last activity was, only
 * once either has lasted `STEADY_MS`: that is when the fact is worth a look.
 * Null when no producer reported this attempt, so an older host adds nothing.
 */
export function attemptLine(feedback: WorkFeedback | undefined, epoch: string | null, nowMs: number): string | null {
  if (!feedback || !epoch) return null;
  const state = feedbackActivity(feedback, epoch);
  if (state === 'working') {
    const since = feedback.wait?.since ? Date.parse(feedback.wait.since) : Number.NaN;
    const last = feedback.lastActivityAt ? Date.parse(feedback.lastActivityAt) : Number.NaN;
    const facts = [
      nowMs - since >= STEADY_MS ? waitLine(feedback.wait, nowMs) : null,
      nowMs - last >= STEADY_MS ? freshness(feedback, state, nowMs) : null,
    ].filter(Boolean);
    return facts.length > 0 ? facts.join(' · ') : 'Working';
  }
  return state === 'last-known' ? ['Last known', freshness(feedback, state, nowMs)].filter(Boolean).join(' · ') : null;
}

/** Whether the attempt's producer is attached now, which is when a timer on its line should run. */
export function attemptWorking(feedback: WorkFeedback | undefined, epoch: string | null): boolean {
  return !!feedback && !!epoch && feedbackActivity(feedback, epoch) === 'working';
}

/**
 * A request in flight, for a live block. Null when the attempt holds no
 * request, so the block names only what is known.
 */
export function requestWaitOf(feedback: WorkFeedback | undefined, epoch: string | null): { since: number | null } | null {
  if (!feedback || !attemptWorking(feedback, epoch) || feedback.wait?.kind !== 'request') return null;
  const since = feedback.wait.since ? Date.parse(feedback.wait.since) : Number.NaN;
  return { since: Number.isNaN(since) ? null : since };
}
