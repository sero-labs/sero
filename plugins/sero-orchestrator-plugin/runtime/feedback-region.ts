/** Graph helpers and structural rules for the single bounded feedback region. */

import type { LoopPlan, LoopStepDefinition, StepFeedbackTransition } from '../shared/types';

export const SAFE_FEEDBACK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VALUE_TYPES = ['string', 'number', 'boolean'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates the untrusted feedback declaration before graph validation. */
export function validateFeedbackShape(step: Record<string, unknown>, errors: string[]): void {
  if (step.feedback === undefined) return;
  const id = String(step.id);
  const feedback = step.feedback;
  if (!isRecord(feedback)) {
    errors.push(`step "${id}": feedback must be an object`);
    return;
  }
  if (typeof feedback.id !== 'string' || !SAFE_FEEDBACK_ID.test(feedback.id)) {
    errors.push(`step "${id}": feedback.id must be a slug of letters, numbers, "_" or "-" (1–64 chars)`);
  }
  if (typeof feedback.toStepId !== 'string' || !feedback.toStepId.trim()) errors.push(`step "${id}": feedback.toStepId is required`);
  if (!Number.isInteger(feedback.maxTraversalsPerRun) || (feedback.maxTraversalsPerRun as number) < 1) {
    errors.push(`step "${id}": feedback.maxTraversalsPerRun must be a positive integer`);
  }
  if (!isRecord(feedback.when)) {
    errors.push(`step "${id}": feedback.when must be { var, in }`);
    return;
  }
  if (typeof feedback.when.var !== 'string' || !feedback.when.var.trim()) errors.push(`step "${id}": feedback.when.var is required`);
  if (!Array.isArray(feedback.when.in) || feedback.when.in.length === 0 || feedback.when.in.some((value) => !VALUE_TYPES.includes(typeof value))) {
    errors.push(`step "${id}": feedback.when.in must be a non-empty array of string/number/boolean values`);
  }
}

export interface FeedbackRegion {
  sourceStepId: string;
  targetStepId: string;
  feedback: StepFeedbackTransition;
  stepIds: Set<string>;
}

function dependentsOf(steps: LoopStepDefinition[]): Map<string, string[]> {
  const dependents = new Map(steps.map((step) => [step.id, [] as string[]]));
  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) dependents.get(dependency)?.push(step.id);
  }
  return dependents;
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

function reachableFrom(dependents: Map<string, string[]>, stepId: string): Set<string> {
  const reachable = new Set<string>([stepId]);
  const pending = [stepId];
  while (pending.length > 0) {
    for (const id of dependents.get(pending.pop()!) ?? []) {
      if (reachable.has(id)) continue;
      reachable.add(id);
      pending.push(id);
    }
  }
  return reachable;
}

/** Computes T..S: reachable from target and able to reach the source barrier. */
export function computeFeedbackRegion(plan: LoopPlan): FeedbackRegion | undefined {
  const source = plan.steps.find((step) => step.feedback !== undefined);
  if (!source?.feedback) return undefined;
  const ancestors = ancestorsOf(plan.steps, source.id);
  if (!ancestors.has(source.feedback.toStepId)) return undefined;
  const canReachSource = new Set([...ancestors, source.id]);
  const reachable = reachableFrom(dependentsOf(plan.steps), source.feedback.toStepId);
  return {
    sourceStepId: source.id,
    targetStepId: source.feedback.toStepId,
    feedback: source.feedback,
    stepIds: new Set([...reachable].filter((id) => canReachSource.has(id))),
  };
}

/** Feedback graph errors after ordinary step shapes and dependency references pass. */
export function feedbackPlanProblems(plan: LoopPlan): string[] {
  const sources = plan.steps.filter((step) => step.feedback !== undefined);
  if (sources.length > 1) {
    return [`plan supports at most one feedback transition; found ${sources.length} on steps: ${sources.map((step) => step.id).join(', ')}`];
  }
  const source = sources[0];
  if (!source?.feedback) return [];
  const feedback = source.feedback;
  const errors: string[] = [];
  const target = plan.steps.find((step) => step.id === feedback.toStepId);
  if (!target) return [`step "${source.id}": feedback.toStepId references unknown step "${feedback.toStepId}"`];
  if (!ancestorsOf(plan.steps, source.id).has(target.id)) {
    return [`step "${source.id}": feedback target "${target.id}" must be a strict dependency ancestor of the source`];
  }
  if (!(source.produces ?? []).includes(feedback.when.var)) {
    errors.push(`step "${source.id}": feedback variable "${feedback.when.var}" must be listed in the source step's "produces"`);
  }

  const region = computeFeedbackRegion(plan)!;
  const dependents = dependentsOf(plan.steps);
  const stepById = new Map(plan.steps.map((step) => [step.id, step]));
  for (const id of region.stepIds) {
    const step = stepById.get(id)!;
    if (id !== region.targetStepId) {
      for (const dependency of step.dependsOn ?? []) {
        if (!region.stepIds.has(dependency)) {
          errors.push(`feedback region is not single-entry: outside step "${dependency}" enters region step "${id}" instead of target "${region.targetStepId}"`);
        }
      }
    }
    if (id !== region.sourceStepId) {
      for (const dependent of dependents.get(id) ?? []) {
        if (!region.stepIds.has(dependent)) {
          errors.push(`feedback region is not single-exit: region step "${id}" exits to "${dependent}" before source barrier "${region.sourceStepId}"`);
        }
      }
    }
    if (step.gate === 'approval') errors.push(`feedback region cannot contain approval step "${id}"`);
  }

  const dependedOn = new Set(plan.steps.flatMap((step) => step.dependsOn ?? []));
  const finalStep = plan.steps.find((step) => !dependedOn.has(step.id));
  if (finalStep && region.stepIds.has(finalStep.id)) {
    errors.push(`feedback region cannot contain finalization step "${finalStep.id}"`);
  }
  return [...new Set(errors)];
}
