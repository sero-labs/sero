/**
 * Branch resolution (specs/05-branching.md). Runs before readiness each tick:
 * marks a guarded step `skipped` once its dependencies have resolved and its route
 * didn't match. Unguarded steps always run — and because a `skipped` dependency
 * already satisfies dependents (readiness.ts), the main line continues past a
 * skipped optional step, and an unguarded convergence step runs whichever branch
 * was taken.
 *
 * Every step that belongs to a branch carries its own guard; there is no cascade.
 * A step on an un-taken nested branch skips because its routing variable was never
 * set (its judge didn't run) — see guardTaken's "unset value" rule.
 *
 * Pure: returns the same loop reference when nothing changed. The branch DECISION
 * is the judge step's (it records the routing variable); this module only matches
 * the value it chose — no heuristics.
 */

import type { Loop, LoopStepDefinition, StepGuard } from '../shared/types';

function guardValueMatches(values: (string | number | boolean)[], value: unknown): boolean {
  return values.some((v) => v === value);
}

/** Did any sibling guard on this var (with an `in` list) match the value? */
function matchedAnyInGuard(loop: Loop, varName: string, value: unknown): boolean {
  return loop.plan.steps.some(
    (s) => s.when?.var === varName && s.when.in !== undefined && guardValueMatches(s.when.in, value),
  );
}

/** Whether a guarded step is taken given the current variables. Assumes deps resolved. */
function guardTaken(loop: Loop, guard: StepGuard): boolean {
  const value = loop.runtime.variables[guard.var];
  // An unset routing variable means the decision that routes here never ran (its
  // judge was itself skipped on an un-taken outer branch) → this branch isn't taken.
  if (value === undefined) return false;
  if (guard.default) return !matchedAnyInGuard(loop, guard.var, value);
  return guard.in !== undefined && guardValueMatches(guard.in, value);
}

function depsAllResolved(loop: Loop, step: LoopStepDefinition): boolean {
  return (step.dependsOn ?? []).every((d) => loop.runtime.stepStates[d]?.outcome !== undefined);
}

function markSkipped(loop: Loop, stepId: string, summary: string, now: string): Loop {
  const prev = loop.runtime.stepStates[stepId];
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      stepStates: {
        ...loop.runtime.stepStates,
        [stepId]: { ...prev, status: 'skipped', outcome: { status: 'skipped', summary }, updatedAt: now },
      },
    },
  };
}

/**
 * Marks guarded steps `skipped` to a fixpoint, so a chain of branch steps all
 * resolve within one tick. A pending guarded step is skipped once every
 * dependency has an outcome (the route has been decided) and its guard didn't
 * match. Guard evaluation is gated on resolved dependencies so a guard is never
 * read before its routing variable's producer ran.
 */
export function resolveBranchSkips(loop: Loop, now: string): Loop {
  let current = loop;
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of current.plan.steps) {
      if (!step.when) continue;
      const state = current.runtime.stepStates[step.id];
      if (!state || state.status !== 'pending') continue;
      if (!depsAllResolved(current, step)) continue;
      if (!guardTaken(current, step.when)) {
        current = markSkipped(current, step.id, `branch not taken (route "${step.when.var}" did not match)`, now);
        changed = true;
      }
    }
  }
  return current;
}
