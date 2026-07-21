/** Durable activation-ledger operations. A retry reuses a visit; feedback creates one. */

import type { Loop, LoopRun, StepActivation, StepAttempt, StepOutcome } from '../shared/types';

function activationId(runId: string, stepId: string, visitNumber: number): string {
  return `${runId}:${stepId}:${visitNumber}`;
}

function feedbackContextsByTarget(loop: Loop) {
  const contexts = new Map<string, NonNullable<Loop['runtime']['feedbackStates']>[string]['pendingContext']>();
  for (const step of loop.plan.steps) {
    const feedback = step.feedback;
    if (feedback) contexts.set(feedback.toStepId, loop.runtime.feedbackStates?.[feedback.id]?.pendingContext);
  }
  return contexts;
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
  const latestByStep = new Map<string, StepActivation>();
  const visitCountByStep = new Map<string, number>();
  const activationIndexById = new Map<string, number>();
  const attemptIdsByActivation = new Map<string, Set<string>>();
  const feedbackContexts = feedbackContextsByTarget(loop);
  for (const [index, activation] of activations.entries()) {
    latestByStep.set(activation.stepId, activation);
    visitCountByStep.set(activation.stepId, (visitCountByStep.get(activation.stepId) ?? 0) + 1);
    activationIndexById.set(activation.id, index);
    attemptIdsByActivation.set(activation.id, new Set(activation.attemptIds));
  }
  for (const stepId of stepIds) {
    const state = currentLoop.runtime.stepStates[stepId];
    const prior = latestByStep.get(stepId);
    const retry = prior && (
      prior.status === 'pending'
      || prior.status === 'running'
      || (state.lastAttemptId && attemptIdsByActivation.get(prior.id)?.has(state.lastAttemptId))
    );
    if (retry) {
      ids[stepId] = prior.id;
      const index = activationIndexById.get(prior.id)!;
      const resumed = { ...prior, status: 'running' as const, endedAt: undefined };
      activations[index] = resumed;
      latestByStep.set(stepId, resumed);
      continue;
    }
    const visitNumber = (visitCountByStep.get(stepId) ?? 0) + 1;
    const context = feedbackContexts.get(stepId);
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
    activationIndexById.set(activation.id, activations.length);
    activations.push(activation);
    latestByStep.set(stepId, activation);
    visitCountByStep.set(stepId, visitNumber);
    attemptIdsByActivation.set(activation.id, new Set());
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
  const activations = [...(run.stepActivations ?? [])];
  const index = activations.findIndex((activation) => activation.id === activationIdValue);
  if (index === -1) return run;
  const activation = activations[index];
  const attemptIds = new Set(activation.attemptIds);
  attemptIds.add(attempt.id);
  activations[index] = {
    ...activation,
    status,
    attemptIds: [...attemptIds],
    outcome: completed ? outcome : undefined,
    endedAt: completed ? now : undefined,
  };
  return {
    ...run,
    stepActivations: activations,
  };
}

/** Replaces the final status/outcome when recovery settles an existing visit. */
export function settleActivation(
  run: LoopRun,
  activationIdValue: string,
  outcome: StepOutcome,
  now: string,
): LoopRun {
  const activations = [...(run.stepActivations ?? [])];
  const index = activations.findIndex((activation) => activation.id === activationIdValue);
  if (index === -1) return run;
  activations[index] = { ...activations[index], status: outcome.status, outcome, endedAt: now };
  return { ...run, stepActivations: activations };
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
