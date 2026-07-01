/**
 * Pure step-readiness computation (03-execution-and-scheduling.md, Coordinator
 * Run Flow step 5).
 *
 * A step is ready when:
 *  - its status is pending or ready (or failed with a retry decision applied);
 *  - all dependsOn steps have an outcome status of succeeded or skipped;
 *  - it is not already running;
 *  - it has attempts remaining.
 */

import type { Loop, LoopStepDefinition, StepRuntimeState } from '../shared/types';

const SATISFYING_OUTCOMES = new Set(['succeeded', 'skipped']);

export interface RuntimeValidation {
  ok: boolean;
  error?: string;
}

/** Confirms every step has runtime state and every dependency references a real step. */
export function validateRuntime(loop: Loop): RuntimeValidation {
  const ids = new Set(loop.plan.steps.map((s) => s.id));
  for (const step of loop.plan.steps) {
    if (!loop.runtime.stepStates[step.id]) {
      return { ok: false, error: `missing runtime state for step "${step.id}"` };
    }
    for (const dep of step.dependsOn ?? []) {
      if (!ids.has(dep)) {
        return { ok: false, error: `step "${step.id}" depends on unknown step "${dep}"` };
      }
    }
  }
  return { ok: true };
}

export function dependenciesSatisfied(loop: Loop, step: LoopStepDefinition): boolean {
  return (step.dependsOn ?? []).every((dep) => {
    const state = loop.runtime.stepStates[dep];
    return state?.outcome ? SATISFYING_OUTCOMES.has(state.outcome.status) : false;
  });
}

function attemptsRemaining(step: LoopStepDefinition, state: StepRuntimeState, loop: Loop): boolean {
  const perStep = step.maxAttempts ?? loop.limits.maxAttemptsPerStep;
  if (perStep === undefined) return true;
  return state.attempts < perStep;
}

/** Step ids that are eligible to start now, in plan order. */
export function computeReadySteps(loop: Loop): string[] {
  const ready: string[] = [];
  for (const step of loop.plan.steps) {
    const state = loop.runtime.stepStates[step.id];
    if (!state) continue;
    if (state.status !== 'pending' && state.status !== 'ready') continue;
    if (!dependenciesSatisfied(loop, step)) continue;
    if (!attemptsRemaining(step, state, loop)) continue;
    ready.push(step.id);
  }
  return ready;
}

/** True when at least one step is currently running. */
export function hasRunningSteps(loop: Loop): boolean {
  return Object.values(loop.runtime.stepStates).some((s) => s.status === 'running');
}

/**
 * The loop's finalization step — the single dependency-graph sink (the one step
 * nothing else depends on). Only a planned step outcome emits completion (D-03),
 * and a `complete` signal is honored ONLY from this step, so a mid-plan step that
 * slips one in cannot short-circuit the remaining planned work. When the graph has
 * several leaves we can't single one out, so this returns undefined and the engine
 * falls back to accepting completion from any step (and no step is forced to emit
 * one). Validation funnels every plan to a single sink, so this is normally set.
 */
export function finalizationStepId(loop: Loop): string | undefined {
  const sinks = loop.plan.steps.filter(
    (step) => !loop.plan.steps.some((s) => (s.dependsOn ?? []).includes(step.id)),
  );
  return sinks.length === 1 ? sinks[0].id : undefined;
}
