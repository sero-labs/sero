/**
 * Step executor dispatch + default engine deps.
 *
 * Routes each step to the executor for its execution target. Recovery and
 * outcome evaluation default to conservative stand-ins here; Phase 5 injects
 * the real LLM-backed decider/evaluator and Phase 6 the active-session executor.
 */

import type { EngineDeps, RecoveryDecider, StepExecutor } from '../engine-types';
import type { StepAttempt } from '../../shared/types';
import type { LoopLocks } from '../locks';
import { backgroundAgentExecutor } from './background-agent';
import { modelExecutor } from './model';
import { activeSessionExecutor } from './active-session';
import { workspaceResolver } from '../workspace';
import { llmDecider, llmEvaluator } from '../llm-decisions';

export function createDispatchExecutor(activeSession: StepExecutor = activeSessionExecutor): StepExecutor {
  return {
    run(input) {
      switch (input.step.execution.type) {
        case 'background-agent':
          return backgroundAgentExecutor.run(input);
        case 'model':
          return modelExecutor.run(input);
        case 'active-session':
          return activeSession.run(input);
      }
    },
  };
}

/** Default recovery decider used until the LLM decider is wired (Phase 5). */
export const blockingDecider: RecoveryDecider = {
  async decide(input) {
    return {
      id: input.host.newId('recovery'),
      stepId: input.step.id,
      failedAttemptId: input.attempt.id,
      decision: 'block-loop',
      reason: input.outcome.summary || `step ${input.step.id} ${input.outcome.status}`,
      createdAt: input.host.now(),
    };
  },
};

export interface EngineDepsOverrides {
  executor?: StepExecutor;
  decider?: RecoveryDecider;
  evaluator?: EngineDeps['evaluator'];
  stopChecker?: EngineDeps['stopChecker'];
}

export function createEngineDeps(locks: LoopLocks, overrides: EngineDepsOverrides = {}): EngineDeps {
  return {
    executor: overrides.executor ?? createDispatchExecutor(),
    decider: overrides.decider ?? llmDecider,
    evaluator: overrides.evaluator ?? llmEvaluator,
    // Left unset by default so unit tests make no per-step model call; the real
    // runtime wires `llmStopChecker` explicitly (runtime/index.ts).
    stopChecker: overrides.stopChecker,
    locks,
    workspaceResolver,
  };
}

export type { StepAttempt };
