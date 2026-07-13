/**
 * Structural validation for LLM-authored plans (D-09).
 *
 * Validation only checks structure: unique step ids, valid dependency
 * references, an acyclic dependency graph, supported execution targets, at least
 * one step, and that the plan funnels to exactly one final step (single sink).
 * It does NOT judge whether a workflow is safe, cheap, or likely to succeed.
 *
 * All functions are pure so they can be unit tested directly.
 */

import type {
  LoopDeliverySettings,
  LoopPlan,
  LoopStepDefinition,
  PlanningResponse,
  StepExecutionTarget,
} from '../shared/types';
import { EVENT_SOURCE_NAMESPACES, isKnownEventSource } from '../shared/constants';
import { approvalGateProblems } from './delivery/validate';
import { isValidCron } from './cron';

export const STEP_EXECUTION_TYPES = ['background-agent', 'active-session', 'model'] as const;
const SESSION_STRATEGIES = ['specific-session', 'most-recent-active', 'ask-user'];
const DELIVER_AS = ['steer', 'followUp', 'nextTurn'];

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Step ids must be a safe slug: they are interpolated into artifact file paths
 * (`loops/<id>/artifacts/runs/<runId>/<stepId>-a<n>.txt`). Rejecting `/`, `..`,
 * and other path characters keeps an LLM-authored or library-loaded plan from
 * writing outside the Orchestrator state dir. The host artifact store enforces
 * the same containment as a backstop.
 */
export const SAFE_STEP_ID = /^[A-Za-z0-9_-]{1,64}$/;

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
  if (type === 'background-agent' || type === 'model') {
    // model/thinking are optional. When present they must be strings — a tier
    // ("LOW"/"MED"/"HIGH") or a "provider/modelId" ref the user pinned later.
    if (execution.model !== undefined && (typeof execution.model !== 'string' || !execution.model.trim())) {
      errors.push(`step "${stepId}": execution.model must be a non-empty string (a tier "LOW"/"MED"/"HIGH" or a "provider/modelId")`);
    }
    if (execution.thinking !== undefined && typeof execution.thinking !== 'string') {
      errors.push(`step "${stepId}": execution.thinking must be a string`);
    }
  }
  if (type === 'background-agent' && execution.tools !== undefined) {
    // Optional per-step tool allowlist. Structure only — unknown names are
    // harmlessly ignored by the session allowlist, so we don't check membership.
    if (!Array.isArray(execution.tools) || execution.tools.some((t) => typeof t !== 'string' || !t.trim())) {
      errors.push(`step "${stepId}": execution.tools must be an array of non-empty tool-name strings`);
    }
  }
  if (type === 'background-agent' && execution.agent !== undefined) {
    // Optional named agent role. Structure only — an unknown role is handled at
    // run time (fall back to the default + warn), so we don't check membership.
    if (typeof execution.agent !== 'string' || !execution.agent.trim()) {
      errors.push(`step "${stepId}": execution.agent must be a non-empty agent-name string`);
    }
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
  } else if (!SAFE_STEP_ID.test(step.id)) {
    errors.push(`step "${step.id}": id must be a slug of letters, numbers, "_" or "-" (1–64 chars) — it is used in artifact file paths`);
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
  if (step.gate !== undefined && step.gate !== 'approval') {
    errors.push(`step "${String(step.id)}": gate, if present, must be exactly "approval"`);
    ok = false;
  }
  validateExecution(step.execution, String(step.id), errors);
  validateBranching(step, errors);
  return ok;
}

const GUARD_VALUE_TYPES = ['string', 'number', 'boolean'];

/** Validates the optional `produces` declaration and `when` guard shape on a step. */
function validateBranching(step: Record<string, unknown>, errors: string[]): void {
  const id = String(step.id);
  if (step.produces !== undefined && (!Array.isArray(step.produces) || step.produces.some((p) => typeof p !== 'string' || !p.trim()))) {
    errors.push(`step "${id}": produces must be an array of non-empty variable names`);
  }
  if (step.when === undefined) return;
  const guard = step.when;
  if (!isRecord(guard)) {
    errors.push(`step "${id}": when must be an object { var, in | default }`);
    return;
  }
  if (typeof guard.var !== 'string' || !guard.var.trim()) errors.push(`step "${id}": when.var is required`);
  const hasIn = guard.in !== undefined;
  const hasDefault = guard.default !== undefined;
  if (hasIn === hasDefault) {
    errors.push(`step "${id}": when needs exactly one of "in" (a non-empty list) or "default": true`);
  }
  if (hasIn && (!Array.isArray(guard.in) || guard.in.length === 0 || guard.in.some((v) => !GUARD_VALUE_TYPES.includes(typeof v)))) {
    errors.push(`step "${id}": when.in must be a non-empty array of string/number/boolean values`);
  }
  if (hasDefault && guard.default !== true) errors.push(`step "${id}": when.default must be true`);
}

/** A guard's routing variable must be produced by a dependency-ancestor step. */
function validateGuardSources(steps: LoopStepDefinition[], errors: string[]): void {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const producedByStep = new Map(steps.map((step) => [step.id, new Set(step.produces ?? [])]));
  const ancestorsOf = (startId: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(byId.get(startId)?.dependsOn ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const dep of byId.get(id)?.dependsOn ?? []) stack.push(dep);
    }
    return seen;
  };
  for (const step of steps) {
    if (!step.when) continue;
    const produced = [...ancestorsOf(step.id)].some((ancestorId) =>
      producedByStep.get(ancestorId)?.has(step.when!.var),
    );
    if (!produced) {
      errors.push(`step "${step.id}": guard variable "${step.when.var}" is not produced by any upstream step (a dependency-ancestor must list it in "produces")`);
    }
  }
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

/**
 * A well-formed plan funnels to exactly one finalization step — the single sink
 * (the step nothing else depends on) that emits the completion signal (D-03).
 * More than one sink means the plan has parallel loose ends that never converge,
 * so the loop has no single place to finish; with several steps and no
 * dependencies at all, every step is a sink and they would all run at once.
 */
function validateSingleFinalStep(steps: LoopStepDefinition[], errors: string[]): void {
  if (steps.length < 2) return;
  const dependedOn = new Set<string>();
  for (const step of steps) for (const dep of step.dependsOn ?? []) dependedOn.add(dep);
  const sinks = steps.filter((s) => !dependedOn.has(s.id)).map((s) => s.id);
  if (sinks.length !== 1) {
    errors.push(
      `plan must funnel to exactly one final step (a step nothing else depends on); found ${sinks.length}: ${sinks.join(', ')}. Use dependsOn to order the work so every step leads into a single finalization step that emits completion.`,
    );
  }
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
  if (errors.length === 0) {
    validateDependencies(plan.steps, errors);
    if (errors.length === 0) {
      validateSingleFinalStep(plan.steps, errors);
      validateGuardSources(plan.steps, errors);
    }
  }
  return errors;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Minimal step normalization. The planner prompt specifies the exact step shape;
 * the tolerance kept is the one models reach for constantly — a bare ordered list
 * of steps (strings or objects) with no dependencies. When NO step wires a
 * dependsOn, the order is read as a sequence and each step is chained to the
 * previous one (so it funnels to a single final step). When the model wires any
 * dependsOn itself, that structure is respected and nothing is added. ids and
 * execution are defaulted; everything else is validated strictly.
 */
function normalizeSteps(raw: unknown[]): unknown[] {
  const ids = raw.map((entry, i) =>
    isRecord(entry) && typeof entry.id === 'string' && entry.id.trim() ? entry.id : `step-${i + 1}`,
  );
  const hasExplicitDeps = raw.some((e) => isRecord(e) && Array.isArray(e.dependsOn) && e.dependsOn.length > 0);
  const sequentialDep = (i: number): string[] | undefined => (!hasExplicitDeps && i > 0 ? [ids[i - 1]] : undefined);

  return raw.map((entry, i) => {
    const id = ids[i];
    if (typeof entry === 'string') {
      return {
        id,
        title: truncate(entry, 60),
        instructions: entry,
        execution: { type: 'background-agent' },
        dependsOn: sequentialDep(i),
      };
    }
    if (isRecord(entry)) {
      return {
        ...entry,
        id,
        execution: isRecord(entry.execution) ? entry.execution : { type: 'background-agent' },
        dependsOn: Array.isArray(entry.dependsOn) ? entry.dependsOn : sequentialDep(i),
      };
    }
    return { id, title: `Step ${i + 1}`, instructions: String(entry), execution: { type: 'background-agent' }, dependsOn: sequentialDep(i) };
  });
}

/**
 * Thin pre-validation reshape. The planner prompt carries the exact shape; this
 * only locates the steps (canonical `plan.steps`, a bare `plan` array, or a flat
 * top-level `steps`) and supplies the envelope. Everything else is left to the
 * strict validator + the one repair pass.
 */
export function coercePlanningShape(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const value = input;
  const planObj = isRecord(value.plan) ? value.plan : undefined;
  const rawSteps =
    planObj && Array.isArray(planObj.steps) ? planObj.steps
    : Array.isArray(value.plan) ? value.plan
    : Array.isArray(value.steps) ? value.steps
    : undefined;

  if (!Array.isArray(rawSteps)) return value; // nothing to coerce; strict validator reports

  return {
    ...value,
    plan: {
      schemaVersion: 1,
      revision: planObj && typeof planObj.revision === 'number' ? planObj.revision : 0,
      objective:
        (planObj && typeof planObj.objective === 'string' && planObj.objective) ||
        (typeof value.objective === 'string' ? value.objective : ''),
      steps: normalizeSteps(rawSteps),
      globalInstructions: (planObj?.globalInstructions ?? value.globalInstructions) as string | undefined,
      variablesSchema: planObj?.variablesSchema ?? value.variablesSchema,
    },
  };
}

// ── Delivery settings ───────────────────────────────────────
// Delivery validation lives in delivery/validate.ts (500-LOC limit); re-exported
// here so callers keep one validation entry point.
export { approvalGateProblems, validateDeliverySettings } from './delivery/validate';

/** Max length of a natural-language event condition (a sentence, not an essay). */
const EVENT_CONDITION_MAX_LENGTH = 500;

function isPrimitive(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null;
}

/**
 * Event-half validation for an event/hybrid trigger: a well-formed source in a
 * known namespace, a flat structured filter (primitives / arrays of primitives),
 * a bounded condition string, and a sane debounce. Mechanical only — what the
 * condition MEANS is the model's business at fire time. Shared with the trigger
 * extractor and shared-definition validation, which check the same fields
 * under their own labels (structural param type so typed configs fit too).
 */
export interface EventTriggerFields {
  eventSource?: unknown;
  eventFilter?: unknown;
  eventCondition?: unknown;
  debounceMs?: unknown;
}

export function validateEventTriggerFields(trigger: EventTriggerFields, label: string, errors: string[]): void {
  if (typeof trigger.eventSource !== 'string' || !isKnownEventSource(trigger.eventSource)) {
    errors.push(`${label}: an event trigger needs an "eventSource" (aka "source") of the form "<namespace>:<kind>" with a known namespace (${EVENT_SOURCE_NAMESPACES.join(', ')}), got ${JSON.stringify(trigger.eventSource)}.`);
  }
  if (trigger.eventFilter !== undefined) {
    const flat =
      isRecord(trigger.eventFilter) &&
      Object.values(trigger.eventFilter).every((v) => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)));
    if (!flat) {
      errors.push(`${label}: the "eventFilter" (aka "filter") must be a flat object of primitive values (or arrays of primitives, meaning "one of").`);
    }
  }
  if (trigger.eventCondition !== undefined) {
    const text = trigger.eventCondition;
    if (typeof text !== 'string' || !text.trim() || text.length > EVENT_CONDITION_MAX_LENGTH) {
      errors.push(`${label}: the condition must be a non-empty string of at most ${EVENT_CONDITION_MAX_LENGTH} characters.`);
    }
  }
  if (trigger.debounceMs !== undefined && (typeof trigger.debounceMs !== 'number' || !Number.isFinite(trigger.debounceMs) || trigger.debounceMs < 0)) {
    errors.push(`${label}: "debounceMs" must be a non-negative number.`);
  }
}

/**
 * A cron/hybrid trigger must carry a valid 5-field cron schedule, and an
 * event/hybrid trigger a valid event half — else it never fires (or fires on
 * everything).
 */
function validateSuggestedTriggers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const errors: string[] = [];
  raw.forEach((trigger, i) => {
    if (!isRecord(trigger)) return;
    if (trigger.type === 'cron' || trigger.type === 'hybrid') {
      if (typeof trigger.schedule !== 'string' || !isValidCron(trigger.schedule)) {
        errors.push(`suggestedTriggers[${i}]: a "${String(trigger.type)}" trigger needs a valid 5-field cron "schedule" (minute hour day-of-month month day-of-week), got ${JSON.stringify(trigger.schedule)}.`);
      }
    }
    if (trigger.type === 'event' || trigger.type === 'hybrid') {
      validateEventTriggerFields(trigger, `suggestedTriggers[${i}]`, errors);
    }
  });
  return errors;
}

/** Validates raw model output into a PlanningResponse. `delivery` adds the destination-specific plan-shape rules (approval gate for external sends). */
export function validatePlanningResponse(input: unknown, delivery?: LoopDeliverySettings): ValidationResult<PlanningResponse> {
  const value = coercePlanningShape(input);
  if (!isRecord(value)) return { ok: false, errors: ['response must be a JSON object'] };
  if (!isRecord(value.plan)) return { ok: false, errors: ['plan is required'] };

  const plan = value.plan as Record<string, unknown>;
  const errors = validateLoopPlan(plan as unknown as LoopPlan);
  if (errors.length === 0 && delivery) errors.push(...approvalGateProblems(plan as unknown as LoopPlan, delivery));
  if (errors.length > 0) return { ok: false, errors };

  const triggerErrors = validateSuggestedTriggers(value.suggestedTriggers);
  if (triggerErrors.length > 0) return { ok: false, errors: triggerErrors };

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
