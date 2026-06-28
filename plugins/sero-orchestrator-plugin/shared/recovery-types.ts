/**
 * Recovery decision and completion signal types.
 *
 * Split from types.ts (500-LOC limit) and re-exported there so existing imports
 * keep resolving. The type-only import from ./types is erased at compile time, so
 * the re-export cycle is harmless.
 */

import type { LoopPlan, LoopStepDefinition, StepOutcome } from './types';

// ── Recovery ────────────────────────────────────────────────

export type RecoveryDecisionKind =
  | 'retry-step'
  | 'revise-step'
  | 'revise-plan'
  | 'skip-step'
  | 'accept-step'
  | 'wait'
  | 'block-loop';

export interface RecoveryDecision {
  id: string;
  stepId: string;
  failedAttemptId: string;
  decision: RecoveryDecisionKind;
  reason: string;
  revisedStep?: LoopStepDefinition;
  revisedPlan?: LoopPlan;
  /** Set for accept-step: the success outcome the step should have reported. */
  acceptedOutcome?: StepOutcome;
  createdAt: string;
  modelResponsePath?: string;
}

// ── Completion ──────────────────────────────────────────────

export interface CompletionSignal {
  status: 'complete' | 'blocked';
  /** For a scheduled (recurring) loop: stop the schedule permanently (success criteria met). */
  final?: boolean;
  sourceStepId: string;
  sourceAttemptId: string;
  reason: string;
  createdAt: string;
  modelResponsePath?: string;
}

export interface StepCompletion {
  status: 'complete' | 'blocked';
  reason: string;
  /**
   * Recurring loops only: set true when the loop's overall success criteria is
   * met, to stop the schedule for good. Omitted/false means "this iteration is
   * done" — the loop stays scheduled and runs again on its next fire.
   */
  final?: boolean;
}
