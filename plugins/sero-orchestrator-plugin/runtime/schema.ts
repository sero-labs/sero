/**
 * Structural validation for LLM-authored plans (D-09).
 *
 * Validation only checks structure: unique step ids, valid dependency
 * references, an acyclic dependency graph, supported execution targets, and at
 * least one step. It does NOT judge whether a workflow is safe, cheap, or
 * likely to succeed.
 *
 * All functions are pure so they can be unit tested directly.
 */

import type {
  LoopPlan,
  LoopStepDefinition,
  PlanningResponse,
  StepExecutionTarget,
} from '../shared/types';

export const STEP_EXECUTION_TYPES = ['background-agent', 'active-session', 'model'] as const;
const SESSION_STRATEGIES = ['specific-session', 'most-recent-active', 'ask-user'];
const DELIVER_AS = ['steer', 'followUp', 'nextTurn'];

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses JSON from raw model text, tolerating ```json fences and surrounding prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : sliceToOutermostObject(trimmed);
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function sliceToOutermostObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
}

// ── Execution target ────────────────────────────────────────

function validateExecution(execution: unknown, stepId: string, errors: string[]): void {
  if (!isRecord(execution)) {
    errors.push(`step "${stepId}": execution must be an object`);
    return;
  }
  const type = execution.type;
  if (typeof type !== 'string' || !STEP_EXECUTION_TYPES.includes(type as StepExecutionTarget['type'])) {
    errors.push(`step "${stepId}": unsupported execution target "${String(type)}"`);
    return;
  }
  if (type === 'active-session') {
    const target = execution.sessionTarget;
    if (!isRecord(target)) {
      errors.push(`step "${stepId}": active-session requires a sessionTarget`);
      return;
    }
    if (typeof target.workspaceId !== 'string') errors.push(`step "${stepId}": sessionTarget.workspaceId is required`);
    if (typeof target.strategy !== 'string' || !SESSION_STRATEGIES.includes(target.strategy)) {
      errors.push(`step "${stepId}": invalid sessionTarget.strategy`);
    }
    if (typeof target.deliverAs !== 'string' || !DELIVER_AS.includes(target.deliverAs)) {
      errors.push(`step "${stepId}": invalid sessionTarget.deliverAs`);
    }
    if (typeof target.triggerTurn !== 'boolean') errors.push(`step "${stepId}": sessionTarget.triggerTurn must be boolean`);
  }
}

// ── Step ────────────────────────────────────────────────────

function validateStepShape(step: unknown, index: number, errors: string[]): step is LoopStepDefinition {
  if (!isRecord(step)) {
    errors.push(`step #${index}: must be an object`);
    return false;
  }
  let ok = true;
  if (typeof step.id !== 'string' || !step.id.trim()) {
    errors.push(`step #${index}: id is required`);
    ok = false;
  }
  if (typeof step.title !== 'string' || !step.title.trim()) {
    errors.push(`step "${String(step.id)}": title is required`);
    ok = false;
  }
  if (typeof step.instructions !== 'string' || !step.instructions.trim()) {
    errors.push(`step "${String(step.id)}": instructions are required`);
    ok = false;
  }
  if (step.dependsOn !== undefined && (!Array.isArray(step.dependsOn) || step.dependsOn.some((d) => typeof d !== 'string'))) {
    errors.push(`step "${String(step.id)}": dependsOn must be an array of step ids`);
    ok = false;
  }
  validateExecution(step.execution, String(step.id), errors);
  return ok;
}

// ── Dependency graph ────────────────────────────────────────

function validateDependencies(steps: LoopStepDefinition[], errors: string[]): void {
  const ids = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!ids.has(dep)) errors.push(`step "${step.id}": dependsOn references unknown step "${dep}"`);
      if (dep === step.id) errors.push(`step "${step.id}": cannot depend on itself`);
    }
  }
  const cycle = findCycle(steps);
  if (cycle) errors.push(`dependency cycle detected: ${cycle.join(' -> ')}`);
}

/** Returns a cycle path if the dependency graph is not acyclic, else null. */
export function findCycle(steps: LoopStepDefinition[]): string[] | null {
  const edges = new Map<string, string[]>();
  for (const step of steps) edges.set(step.id, step.dependsOn ?? []);
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const status = state.get(id);
    if (status === 'done') return null;
    if (status === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of edges.get(id) ?? []) {
      if (!edges.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const step of steps) {
    const found = visit(step.id);
    if (found) return found;
  }
  return null;
}

// ── Plan & response ─────────────────────────────────────────

/** Validates an already-typed LoopPlan. Returns the list of structural errors. */
export function validateLoopPlan(plan: LoopPlan): string[] {
  const errors: string[] = [];
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push('plan must contain at least one step');
    return errors;
  }
  plan.steps.forEach((step, index) => validateStepShape(step, index, errors));
  // Only check graph wiring once individual shapes are sound enough to have ids.
  const ids = plan.steps.map((s) => s.id).filter((id): id is string => typeof id === 'string');
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const dup of new Set(duplicates)) errors.push(`duplicate step id "${dup}"`);
  if (errors.length === 0) validateDependencies(plan.steps, errors);
  return errors;
}

/** Validates raw model output into a PlanningResponse. */
export function validatePlanningResponse(value: unknown): ValidationResult<PlanningResponse> {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['response must be a JSON object'] };
  if (typeof value.title !== 'string' || !value.title.trim()) errors.push('title is required');
  if (typeof value.summary !== 'string') errors.push('summary is required');
  if (!isRecord(value.plan)) {
    errors.push('plan is required');
    return { ok: false, errors };
  }
  const plan = value.plan as Record<string, unknown>;
  if (typeof plan.objective !== 'string') errors.push('plan.objective is required');
  errors.push(...validateLoopPlan(plan as unknown as LoopPlan));
  if (errors.length > 0) return { ok: false, errors };

  const normalized: PlanningResponse = {
    schemaVersion: 1,
    title: value.title as string,
    summary: value.summary as string,
    plan: {
      schemaVersion: 1,
      revision: typeof plan.revision === 'number' ? plan.revision : 0,
      objective: plan.objective as string,
      steps: plan.steps as LoopStepDefinition[],
      globalInstructions: typeof plan.globalInstructions === 'string' ? plan.globalInstructions : undefined,
      variablesSchema: plan.variablesSchema,
    },
    suggestedTriggers: Array.isArray(value.suggestedTriggers)
      ? (value.suggestedTriggers as PlanningResponse['suggestedTriggers'])
      : undefined,
    suggestedLimits: isRecord(value.suggestedLimits)
      ? (value.suggestedLimits as PlanningResponse['suggestedLimits'])
      : undefined,
  };
  return { ok: true, value: normalized };
}
