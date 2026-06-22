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

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function normalizeExecution(raw: unknown): StepExecutionTarget {
  if (isRecord(raw) && typeof raw.type === 'string') {
    if (raw.type === 'model') {
      return { type: 'model', model: firstString(raw, ['model']), thinking: firstString(raw, ['thinking']), outputSchema: raw.outputSchema };
    }
    if (raw.type === 'active-session' && isRecord(raw.sessionTarget)) {
      return raw as unknown as StepExecutionTarget; // validated downstream
    }
    if (raw.type === 'background-agent') {
      return { type: 'background-agent', model: firstString(raw, ['model']), thinking: firstString(raw, ['thinking']) };
    }
  }
  return { type: 'background-agent' };
}

/**
 * Turns a loose steps array (plain strings, or objects with varied field names)
 * into canonical LoopStepDefinitions. A bare ordered string list becomes a
 * sequential plan (each step depends on the previous); objects keep their own
 * dependsOn. Step MEANING stays the model's — this only supplies the envelope.
 */
function normalizeSteps(raw: unknown[]): unknown[] {
  const ids = raw.map((entry, i) =>
    isRecord(entry) && typeof entry.id === 'string' && entry.id.trim() ? entry.id : `step-${i + 1}`,
  );
  return raw.map((entry, i) => {
    const id = ids[i];
    if (typeof entry === 'string') {
      return {
        id,
        title: truncate(entry, 60),
        instructions: entry,
        execution: { type: 'background-agent' },
        dependsOn: i > 0 ? [ids[i - 1]] : undefined,
      };
    }
    if (isRecord(entry)) {
      const instructions = firstString(entry, ['instructions', 'description', 'step', 'task', 'detail', 'action']) ?? '';
      const dependsOn =
        Array.isArray(entry.dependsOn) && entry.dependsOn.every((d) => typeof d === 'string')
          ? (entry.dependsOn as string[])
          : undefined;
      return {
        id,
        title: firstString(entry, ['title', 'name']) ?? (instructions ? truncate(instructions, 60) : `Step ${i + 1}`),
        instructions,
        expectedOutcome: firstString(entry, ['expectedOutcome', 'expected', 'outcome']),
        dependsOn,
        execution: normalizeExecution(entry.execution),
        maxAttempts: typeof entry.maxAttempts === 'number' ? entry.maxAttempts : undefined,
        onFailure: firstString(entry, ['onFailure']),
      };
    }
    return { id, title: `Step ${i + 1}`, instructions: String(entry), execution: { type: 'background-agent' } };
  });
}

/**
 * Reshapes common real-model variants into the canonical PlanningResponse shape
 * BEFORE validation. Field-shape tolerance only — step meaning stays the model's:
 *  - a single wrapper key (`{ verification_plan: {...} }`) is descended;
 *  - the steps source is found at `plan` (object or array), `steps`, `workflow`,
 *    or `loopPlan`;
 *  - a plain string array of steps becomes a sequential plan;
 *  - loose step objects are filled to the required step shape.
 */
export function coercePlanningShape(input: unknown): unknown {
  if (!isRecord(input)) return input;
  let value = input;

  if (!hasStepsSource(value) && typeof value.title !== 'string') {
    const keys = Object.keys(value);
    if (keys.length === 1 && isRecord(value[keys[0]])) value = value[keys[0]] as Record<string, unknown>;
  }

  const planObj = [value.plan, value.workflow, value.loopPlan].find(isRecord) as Record<string, unknown> | undefined;
  const rawSteps =
    planObj && Array.isArray(planObj.steps)
      ? planObj.steps
      : [value.plan, value.steps, value.workflow, value.loopPlan].find(Array.isArray);

  if (!Array.isArray(rawSteps)) return value; // nothing to coerce; strict validator reports

  const objective =
    (planObj && typeof planObj.objective === 'string' && planObj.objective) ||
    (typeof value.objective === 'string' ? value.objective : '');
  return {
    ...value,
    plan: {
      schemaVersion: 1,
      revision: planObj && typeof planObj.revision === 'number' ? planObj.revision : 0,
      objective,
      steps: normalizeSteps(rawSteps),
      globalInstructions: (planObj?.globalInstructions ?? value.globalInstructions) as string | undefined,
      variablesSchema: planObj?.variablesSchema ?? value.variablesSchema,
    },
  };
}

function hasStepsSource(value: Record<string, unknown>): boolean {
  return (
    isRecord(value.plan) ||
    Array.isArray(value.plan) ||
    Array.isArray(value.steps) ||
    isRecord(value.workflow) ||
    Array.isArray(value.workflow) ||
    isRecord(value.loopPlan)
  );
}

/** Validates raw model output into a PlanningResponse. */
export function validatePlanningResponse(input: unknown): ValidationResult<PlanningResponse> {
  const value = coercePlanningShape(input);
  if (!isRecord(value)) return { ok: false, errors: ['response must be a JSON object'] };
  if (!isRecord(value.plan)) return { ok: false, errors: ['plan is required'] };

  const plan = value.plan as Record<string, unknown>;
  const errors = validateLoopPlan(plan as unknown as LoopPlan);
  if (errors.length > 0) return { ok: false, errors };

  // Title/summary are cosmetic — default them rather than failing a sound plan.
  const title = typeof value.title === 'string' && value.title.trim() ? value.title : 'Untitled loop';
  const summary =
    typeof value.summary === 'string'
      ? value.summary
      : typeof plan.objective === 'string'
        ? plan.objective
        : '';
  const normalized: PlanningResponse = {
    schemaVersion: 1,
    title,
    summary,
    plan: {
      schemaVersion: 1,
      revision: typeof plan.revision === 'number' ? plan.revision : 0,
      objective: typeof plan.objective === 'string' ? plan.objective : '',
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
