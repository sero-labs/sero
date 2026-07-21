/** Pure bounded-feedback matching and atomic region rearming. */

import type { FeedbackContext, Loop, LoopRun, LoopStepDefinition, StepAttempt, StepOutcome } from '../shared/types';
import { computeFeedbackRegion } from './feedback-region';

export type FeedbackDecision = 'none' | 'traverse' | 'exhausted';

export function feedbackDecision(loop: Loop, step: LoopStepDefinition, outcome: StepOutcome): FeedbackDecision {
  const feedback = step.feedback;
  if (!feedback || outcome.status !== 'succeeded') return 'none';
  const value = outcome.variables?.[feedback.when.var];
  if (!feedback.when.in.some((candidate) => candidate === value)) return 'none';
  const traversals = loop.runtime.feedbackStates?.[feedback.id]?.traversals ?? 0;
  return traversals >= feedback.maxTraversalsPerRun ? 'exhausted' : 'traverse';
}

export function feedbackExhaustedOutcome(step: LoopStepDefinition): StepOutcome {
  const feedback = step.feedback!;
  return {
    status: 'needs-revision',
    summary: `Feedback transition "${feedback.id}" to "${feedback.toStepId}" is exhausted after ${feedback.maxTraversalsPerRun} traversal(s); recovery must revise, wait, or block instead of repeating again.`,
  };
}

export function applyFeedbackTraversal(
  loop: Loop,
  run: LoopRun,
  step: LoopStepDefinition,
  sourceActivationId: string,
  attempt: StepAttempt,
  outcome: StepOutcome,
  now: string,
): Loop {
  const region = computeFeedbackRegion(loop.plan);
  const feedback = step.feedback;
  if (!region || !feedback) return loop;
  const previous = loop.runtime.feedbackStates?.[feedback.id];
  const traversal = (previous?.traversals ?? 0) + 1;
  const context: FeedbackContext = {
    feedbackId: feedback.id,
    traversal,
    sourceStepId: step.id,
    sourceActivationId,
    sourceAttemptId: attempt.id,
    sourceOutcome: outcome,
    observations: attempt.observations,
    outputPath: attempt.outputPath,
  };
  const stepStates = { ...loop.runtime.stepStates };
  const variables = { ...loop.runtime.variables };
  for (const id of region.stepIds) {
    const state = stepStates[id];
    stepStates[id] = { ...state, status: 'pending', attempts: 0, lastAttemptId: undefined, outcome: undefined, updatedAt: now };
    const definition = loop.plan.steps.find((candidate) => candidate.id === id)!;
    for (const variable of definition.produces ?? []) if (variable !== 'notes') delete variables[variable];
  }
  return {
    ...loop,
    runs: loop.runs.map((candidate) => candidate.id === run.id ? run : candidate),
    runtime: {
      ...loop.runtime,
      stepStates,
      variables,
      feedbackStates: {
        ...loop.runtime.feedbackStates,
        [feedback.id]: { traversals: traversal, lastSourceActivationId: sourceActivationId, lastTraversedAt: now, pendingContext: context },
      },
    },
    updatedAt: now,
  };
}
