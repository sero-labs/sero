/** Durable visit and bounded-feedback types for cyclic workflows. */

import type { Observation, StepOutcome } from './types';

export interface StepFeedbackTransition {
  id: string;
  toStepId: string;
  when: {
    var: string;
    in: Array<string | number | boolean>;
  };
  maxTraversalsPerRun: number;
}

export type StepActivationStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'needs-revision'
  | 'cancelled'
  | 'orphaned';

/** Context carried explicitly from the feedback source to the next target visit. */
export interface FeedbackContext {
  feedbackId: string;
  traversal: number;
  sourceStepId: string;
  sourceActivationId: string;
  sourceAttemptId: string;
  sourceOutcome: StepOutcome;
  observations: Observation[];
  outputPath?: string;
}

export interface StepActivation {
  id: string;
  stepId: string;
  visitNumber: number;
  status: StepActivationStatus;
  attemptIds: string[];
  outcome?: StepOutcome;
  triggeredByFeedbackId?: string;
  triggeredByActivationId?: string;
  feedbackContext?: FeedbackContext;
  startedAt: string;
  endedAt?: string;
}

export interface FeedbackRuntimeState {
  traversals: number;
  lastSourceActivationId?: string;
  lastTraversedAt?: string;
  /** Consumed when the target activation for the next visit is created. */
  pendingContext?: FeedbackContext;
}
