/** Structural rules for bounded dynamic fan-out steps (specs/17-dynamic-fan-out.md). */

import type { LoopPlan, LoopStepDefinition } from '../shared/types';
import { MAX_DYNAMIC_FAN_OUT_ITEMS } from '../shared/fanout-types';
import { computeFeedbackRegion } from './feedback-region';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

/** Validates the untrusted fanOut declaration on one step, before graph validation. */
export function validateFanOutShape(step: Record<string, unknown>, errors: string[]): void {
  if (step.fanOut === undefined) return;
  const id = String(step.id);
  const fanOut = step.fanOut;
  if (!isRecord(fanOut)) {
    errors.push(`step "${id}": fanOut must be an object`);
    return;
  }
  if (typeof fanOut.itemsFrom !== 'string' || !fanOut.itemsFrom.trim()) {
    errors.push(`step "${id}": fanOut.itemsFrom is required (the upstream array variable name)`);
  }
  if (typeof fanOut.itemVariable !== 'string' || !fanOut.itemVariable.trim()) {
    errors.push(`step "${id}": fanOut.itemVariable is required (the per-activation item variable name)`);
  }
  if (
    typeof fanOut.itemsFrom === 'string' && typeof fanOut.itemVariable === 'string' &&
    fanOut.itemsFrom.trim() && fanOut.itemsFrom.trim() === fanOut.itemVariable.trim()
  ) {
    errors.push(`step "${id}": fanOut.itemVariable must differ from fanOut.itemsFrom`);
  }
  if (fanOut.itemKey !== undefined && (typeof fanOut.itemKey !== 'string' || !fanOut.itemKey.trim())) {
    errors.push(`step "${id}": fanOut.itemKey, if present, must be a non-empty field name`);
  }
  if (!isPositiveInt(fanOut.maxItems) || fanOut.maxItems > MAX_DYNAMIC_FAN_OUT_ITEMS) {
    errors.push(`step "${id}": fanOut.maxItems must be a positive integer no greater than ${MAX_DYNAMIC_FAN_OUT_ITEMS}`);
  }
  if (fanOut.minItems !== undefined) {
    if (!Number.isInteger(fanOut.minItems) || (fanOut.minItems as number) < 0) {
      errors.push(`step "${id}": fanOut.minItems must be a non-negative integer`);
    } else if (isPositiveInt(fanOut.maxItems) && (fanOut.minItems as number) > fanOut.maxItems) {
      errors.push(`step "${id}": fanOut.minItems must not exceed fanOut.maxItems`);
    }
  }
  if (fanOut.maxConcurrency !== undefined && !isPositiveInt(fanOut.maxConcurrency)) {
    errors.push(`step "${id}": fanOut.maxConcurrency must be a positive integer`);
  }
  if (fanOut.overflow !== undefined && fanOut.overflow !== 'block') {
    errors.push(`step "${id}": fanOut.overflow must be "block" (the only supported mode)`);
  }
}

function ancestorsOf(steps: LoopStepDefinition[], stepId: string): Set<string> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const ancestors = new Set<string>();
  const pending = [...(byId.get(stepId)?.dependsOn ?? [])];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    pending.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return ancestors;
}

/** Fan-out graph errors, after ordinary step shapes and dependency references pass. */
export function fanOutPlanProblems(plan: LoopPlan): string[] {
  const errors: string[] = [];
  const dependedOn = new Set(plan.steps.flatMap((step) => step.dependsOn ?? []));
  const feedbackRegion = computeFeedbackRegion(plan);
  for (const step of plan.steps) {
    const fanOut = step.fanOut;
    if (!fanOut) continue;
    if (step.execution.type !== 'background-agent') {
      errors.push(`step "${step.id}": fanOut is only supported on background-agent steps`);
    }
    if (step.gate === 'approval') {
      errors.push(`step "${step.id}": a fan-out step cannot be an approval gate`);
    }
    if (step.feedback) {
      errors.push(`step "${step.id}": a fan-out step cannot also declare a feedback transition`);
    }
    if (feedbackRegion?.stepIds.has(step.id)) {
      errors.push(`step "${step.id}": a fan-out step cannot be inside the bounded feedback region`);
    }
    if (plan.steps.length > 1 && !dependedOn.has(step.id)) {
      errors.push(`step "${step.id}": a fan-out step cannot be the finalization step — a downstream step must join its results`);
    }
    const produced = [...ancestorsOf(plan.steps, step.id)].some((ancestorId) =>
      plan.steps.find((s) => s.id === ancestorId)?.produces?.includes(fanOut.itemsFrom),
    );
    if (!produced) {
      errors.push(`step "${step.id}": fanOut.itemsFrom "${fanOut.itemsFrom}" is not produced by any upstream step (a dependency-ancestor must list it in "produces")`);
    }
  }
  return errors;
}
