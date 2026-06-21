/**
 * Applies a StepOutcome to loop runtime state and detects planned completion.
 *
 * `status` on a StepAttempt is mechanical; `outcome` is the LLM-reported or
 * LLM-evaluated logical result. A loop completes ONLY when a step outcome
 * includes `completion.status === "complete"` (D-03).
 */

import type {
  CompletionSignal,
  Loop,
  StepAttempt,
  StepOutcome,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';

/** Maps a step outcome status to the matching step runtime status. */
function outcomeToStepStatus(status: StepOutcome['status']): StepRuntimeState['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'skipped':
      return 'skipped';
    case 'needs-revision':
      return 'needs-revision';
  }
}

/** Records the outcome on the step state and shallow-merges any variables. */
export function applyStepOutcome(
  loop: Loop,
  stepId: string,
  attempt: StepAttempt,
  outcome: StepOutcome,
  now: string,
): Loop {
  const prev = loop.runtime.stepStates[stepId];
  const stepStates = {
    ...loop.runtime.stepStates,
    [stepId]: {
      ...prev,
      status: outcomeToStepStatus(outcome.status),
      lastAttemptId: attempt.id,
      outcome,
      updatedAt: now,
    },
  };
  const variables = outcome.variables
    ? { ...loop.runtime.variables, ...outcome.variables }
    : loop.runtime.variables;
  return { ...loop, runtime: { ...loop.runtime, stepStates, variables }, updatedAt: now };
}

export interface CompletionResult {
  loop: Loop;
  signal: CompletionSignal;
}

/**
 * Records a completion signal emitted by a planned step outcome and moves the
 * loop to `complete` or `blocked` accordingly.
 */
export function recordCompletion(
  host: OrchestratorHost,
  loop: Loop,
  stepId: string,
  attempt: StepAttempt,
  outcome: StepOutcome,
): CompletionResult {
  const completion = outcome.completion!;
  const now = host.now();
  const signal: CompletionSignal = {
    status: completion.status,
    sourceStepId: stepId,
    sourceAttemptId: attempt.id,
    reason: completion.reason,
    createdAt: now,
    modelResponsePath: attempt.outputPath,
  };
  const block =
    completion.status === 'blocked'
      ? { kind: 'planned-block' as const, reason: completion.reason, createdAt: now, sourceStepId: stepId, sourceAttemptId: attempt.id }
      : undefined;
  return {
    loop: {
      ...loop,
      status: completion.status === 'complete' ? 'complete' : 'blocked',
      runtime: { ...loop.runtime, completion: signal, block },
      updatedAt: now,
    },
    signal,
  };
}
