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

import type { LiveCall, Loop, StepStatus } from '../../shared/types';

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

/** The run the Workflow is working on now, if it names one. */
function activeRun(loop: Loop) {
  const activeRunId = loop.runtime.activeRunId;
  if (!activeRunId) return undefined;
  return loop.runs.find((run) => run.id === activeRunId);
}

/**
 * The live view for one step, or undefined when it has nothing to show.
 * `status` is the step's own runtime state, which is what a reader sees.
 */
export function stepLiveView(loop: Loop, stepId: string, status: StepStatus | undefined): StepLiveView | undefined {
  if (status !== 'running') return undefined;

  const call = loop.runtime.liveCall;
  if (call && call.stepId === stepId) {
    const quietLabel = CHECK_LABELS[call.kind];
    if (quietLabel) return { runId: call.runId, quietLabel };
  }

  const attempt = activeRun(loop)?.stepAttempts.find(
    (entry) => entry.stepId === stepId && entry.status === 'running' && entry.workerRunId,
  );
  return attempt?.workerRunId ? { runId: attempt.workerRunId } : undefined;
}
