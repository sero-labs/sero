/** Durable activation-ledger operations. A retry reuses a visit; feedback creates one. */

import type { Loop, LoopRun, StepActivation, StepAttempt, StepOutcome } from '../shared/types';

function activationId(runId: string, stepId: string, visitNumber: number): string {
  return `${runId}:${stepId}:${visitNumber}`;
}

function pendingFeedbackContext(loop: Loop, stepId: string) {
  const transition = loop.plan.steps.find((step) => step.feedback?.toStepId === stepId)?.feedback;
  return transition ? loop.runtime.feedbackStates?.[transition.id]?.pendingContext : undefined;
}

function consumeFeedbackContext(loop: Loop, feedbackId: string): Loop {
  const current = loop.runtime.feedbackStates?.[feedbackId];
  if (!current?.pendingContext) return loop;
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      feedbackStates: { ...loop.runtime.feedbackStates, [feedbackId]: { ...current, pendingContext: undefined } },
    },
  };
}

export interface StartedActivations {
  loop: Loop;
  run: LoopRun;
  activationIds: Record<string, string>;
}

/** Creates or resumes the logical visit for every step about to start. */
export function startActivations(
  loop: Loop,
  run: LoopRun,
  stepIds: string[],
  now: string,
): StartedActivations {
  let currentLoop = loop;
  let activations = [...(run.stepActivations ?? [])];
  const ids: Record<string, string> = {};
  for (const stepId of stepIds) {
    const state = currentLoop.runtime.stepStates[stepId];
    const prior = [...activations].reverse().find((activation) => activation.stepId === stepId);
    const retry = prior && (prior.status === 'pending' || prior.status === 'running' || (state.lastAttemptId && prior.attemptIds.includes(state.lastAttemptId)));
    if (retry) {
      ids[stepId] = prior.id;
      activations = activations.map((activation) => activation.id === prior.id
        ? { ...activation, status: 'running' as const, endedAt: undefined }
        : activation);
      continue;
    }
    const visitNumber = activations.filter((activation) => activation.stepId === stepId).length + 1;
    const context = pendingFeedbackContext(currentLoop, stepId);
    const activation: StepActivation = {
      id: activationId(run.id, stepId, visitNumber),
      stepId,
      visitNumber,
      status: 'running',
      attemptIds: [],
      triggeredByFeedbackId: context?.feedbackId,
      triggeredByActivationId: context?.sourceActivationId,
      feedbackContext: context,
      startedAt: now,
    };
    ids[stepId] = activation.id;
    activations.push(activation);
    if (context) currentLoop = consumeFeedbackContext(currentLoop, context.feedbackId);
  }
  return { loop: currentLoop, run: { ...run, stepActivations: activations }, activationIds: ids };
}

/** Appends one attempt and either finishes or parks its activation. */
export function recordActivationAttempt(
  run: LoopRun,
  activationIdValue: string,
  attempt: StepAttempt,
  outcome: StepOutcome,
  now: string,
  completed = true,
): LoopRun {
  const status: StepActivation['status'] = completed ? outcome.status : 'pending';
  return {
    ...run,
    stepActivations: (run.stepActivations ?? []).map((activation) => activation.id === activationIdValue
      ? {
          ...activation,
          status,
          attemptIds: activation.attemptIds.includes(attempt.id) ? activation.attemptIds : [...activation.attemptIds, attempt.id],
          outcome: completed ? outcome : undefined,
          endedAt: completed ? now : undefined,
        }
      : activation),
  };
}

/** Marks activations interrupted by cancellation/restart without discarding history. */
export function orphanRunningActivations(run: LoopRun, now: string, status: 'cancelled' | 'orphaned'): LoopRun {
  if (!run.stepActivations) return run;
  return {
    ...run,
    stepActivations: run.stepActivations.map((activation) => activation.status === 'running'
      ? { ...activation, status, endedAt: now }
      : activation),
  };
}

/** Latest activation for a step, used by prompt assembly and tests. */
export function latestActivation(run: LoopRun | undefined, stepId: string): StepActivation | undefined {
  return [...(run?.stepActivations ?? [])].reverse().find((activation) => activation.stepId === stepId);
}
