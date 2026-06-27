/**
 * Seams the run engine depends on. Phase 3 exercises these with fakes; Phase 4
 * provides the real step executor (background-agent/model + workspace + limits)
 * and Phase 5 provides the real recovery decider and outcome evaluator (LLM).
 */

import type {
  Loop,
  LoopRun,
  LoopStepDefinition,
  RecoveryDecision,
  ResolvedWorkspaceContext,
  StepAttempt,
  StepOutcome,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import type { LoopLocks } from './locks';

export interface StepRunInput {
  host: OrchestratorHost;
  loop: Loop;
  run: LoopRun;
  step: LoopStepDefinition;
  attemptNumber: number;
  parentSessionId: string;
  workspace?: ResolvedWorkspaceContext;
  signal?: AbortSignal;
}

/** Starts one step attempt and returns the recorded attempt (outcome optional). */
export interface StepExecutor {
  run(input: StepRunInput): Promise<StepAttempt>;
}

export interface RecoveryInput {
  host: OrchestratorHost;
  loop: Loop;
  step: LoopStepDefinition;
  attempt: StepAttempt;
  outcome: StepOutcome;
}

/** Decides how to recover after a failed/blocked/needs-revision outcome. */
export interface RecoveryDecider {
  decide(input: RecoveryInput): Promise<RecoveryDecision>;
}

/** Turns raw execution output into a StepOutcome when none was reported. */
export interface OutcomeEvaluator {
  evaluate(input: { host: OrchestratorHost; loop: Loop; step: LoopStepDefinition; attempt: StepAttempt }): Promise<StepOutcome>;
}

/** Resolves the loop workspace before background filesystem work starts (Phase 4). */
export interface WorkspaceResolver {
  resolve(host: OrchestratorHost, loop: Loop): Promise<{ loop: Loop; workspace?: ResolvedWorkspaceContext; deferred?: string }>;
}

/**
 * Judges, after a step in a recurring loop, whether the loop's overall stop
 * condition is now met so the pass can end immediately. Optional: unset in unit
 * tests (no model call); the real LLM checker is wired in production.
 */
export interface StopChecker {
  check(input: { host: OrchestratorHost; loop: Loop; run: LoopRun }): Promise<{ stop: boolean; reason: string }>;
}

export interface EngineDeps {
  executor: StepExecutor;
  decider: RecoveryDecider;
  locks: LoopLocks;
  evaluator?: OutcomeEvaluator;
  workspaceResolver?: WorkspaceResolver;
  stopChecker?: StopChecker;
}
