/**
 * Routing-variable contract (specs/05-branching.md).
 *
 * A branch only works if the step that DECLARES a routing variable (lists it in
 * `produces`) actually RECORDS it in its StepOutcome `variables` when it runs.
 * If it doesn't, every guard on that variable reads `undefined`, the guarded
 * steps are silently skipped, and the loop can "complete" having done nothing —
 * the worst possible failure mode (a hollow success).
 *
 * `produces` is advisory in the type, so the contract is enforced at runtime,
 * defence in depth:
 *  1. tell the producing agent EXACTLY which variables it must record and the
 *     values downstream guards test (buildStepTask), and
 *  2. re-prompt it in-session if a `succeeded` reply omits one (the executor's
 *     outcome repair), and
 *  3. as a backstop, refuse to accept a `succeeded` outcome that still omits a
 *     guard-relevant produced variable — it becomes `needs-revision`, so the
 *     normal recovery path handles it instead of passing as success.
 *
 * Only variables some guard actually switches on are enforced; a `produces`
 * entry no guard reads is purely informational. All functions are pure (no host)
 * so they unit-test directly and run anywhere in the engine.
 */

import type { Loop, LoopStepDefinition, StepOutcome } from '../shared/types';

export interface RouteVarRequirement {
  /** Variable name the step must record. */
  name: string;
  /** Values sibling guards test with `in` — the routes the agent should pick from. */
  allowed: (string | number | boolean)[];
  /** A sibling guard has a default branch, so an unlisted value still routes somewhere. */
  hasDefault: boolean;
}

/** The guard-relevant routing variables a step is expected to record when it runs. */
export function routeVariableRequirements(loop: Loop, step: LoopStepDefinition): RouteVarRequirement[] {
  const produced = step.produces ?? [];
  if (produced.length === 0) return [];
  const requirements: RouteVarRequirement[] = [];
  for (const name of produced) {
    const guards = loop.plan.steps.filter((s) => s.when?.var === name);
    if (guards.length === 0) continue; // declared but no guard reads it → advisory only
    const allowed: (string | number | boolean)[] = [];
    let hasDefault = false;
    for (const g of guards) {
      for (const v of g.when!.in ?? []) if (!allowed.includes(v)) allowed.push(v);
      if (g.when!.default) hasDefault = true;
    }
    requirements.push({ name, allowed, hasDefault });
  }
  return requirements;
}

/** Required routing variables a SUCCEEDED outcome failed to record (empty otherwise). */
export function missingRouteVariables(
  loop: Loop,
  step: LoopStepDefinition,
  outcome: StepOutcome,
): RouteVarRequirement[] {
  if (outcome.status !== 'succeeded') return [];
  const reqs = routeVariableRequirements(loop, step);
  if (reqs.length === 0) return [];
  const recorded = outcome.variables ?? {};
  return reqs.filter((r) => !Object.prototype.hasOwnProperty.call(recorded, r.name));
}

/**
 * Backstop: a `succeeded` outcome that omitted a guard-relevant produced variable
 * becomes `needs-revision` (keeping whatever it did record) so recovery handles
 * it, rather than passing as a hollow success that silently skips its branch.
 */
export function enforceRouteContract(loop: Loop, step: LoopStepDefinition, outcome: StepOutcome): StepOutcome {
  const missing = missingRouteVariables(loop, step, outcome);
  if (missing.length === 0) return outcome;
  const names = missing.map((r) => r.name).join(', ');
  return {
    status: 'needs-revision',
    summary: `Reported success but did not record routing variable(s) ${names} that later steps branch on — record them at the top level of "variables" so the branch can be decided.`,
    variables: outcome.variables,
  };
}

function describeAllowed(req: RouteVarRequirement): string {
  if (req.allowed.length === 0) return 'a value naming the route';
  const list = req.allowed.map((v) => JSON.stringify(v)).join(', ');
  return req.hasDefault ? `one of ${list} (or another value → the default route)` : `one of ${list}`;
}

/** Task-prompt section telling the agent which routing variables it MUST record. */
export function formatRouteContract(reqs: RouteVarRequirement[]): string {
  if (reqs.length === 0) return '';
  const lines = reqs.map((r) => `- "${r.name}": set to ${describeAllowed(r)}`);
  return `\nROUTING VARIABLES YOU MUST RECORD — later steps BRANCH on these. Put EVERY one at the TOP LEVEL of your StepOutcome "variables", using these EXACT key names. Omit one and the step that depends on it is silently skipped, so the loop can finish having done nothing:\n${lines.join('\n')}\nDecide each value from your findings; do not rename these keys or nest them inside another object.`;
}

/** In-session repair turn when a `succeeded` reply omitted required routing variables. */
export function formatRouteRepair(missing: RouteVarRequirement[]): string {
  const lines = missing.map((r) => `- "${r.name}": ${describeAllowed(r)}`);
  return [
    'You reported "succeeded" but did not record routing variable(s) that later steps branch on. Without them those steps are skipped and the loop does nothing.',
    `\nAdd these to your StepOutcome "variables" at the TOP LEVEL, using these EXACT keys:\n${lines.join('\n')}`,
    '\nDo NOT redo the work or run more tools. Reply with ONLY the corrected StepOutcome JSON (keep your "status" and "summary") in a ```json fence, and nothing after it.',
  ].join('\n');
}
