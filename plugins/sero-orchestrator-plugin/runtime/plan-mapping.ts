/**
 * Maps a validated PlanningResponse onto a persisted Loop and derives runtime
 * state (step states, warnings). See 03-execution-and-scheduling.md "Planning
 * Flow" and 01-data-model.md mapping rules.
 */

import type {
  ContextOverrides,
  CreateLoopOptions,
  Loop,
  LoopDeliverySettings,
  LoopPlan,
  LoopWarning,
  PlanningResponse,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { isDefaultTool } from '../shared/constants';
import { mergeLimits, materializeTriggers } from './loop-factory';
import { mergeExtractedTriggers, NO_TRIGGERS, type TriggerExtraction } from './trigger-extractor';
import { effectiveDelivery } from '../shared/delivery-types';
import { approvalGateProblems, validateDeliverySettings, validateLoopPlan } from './schema';
import { mergeStepOverride } from './library-overlay';

/** Initial (pending) runtime state for every step in a plan. */
export function initStepStates(plan: LoopPlan, now: string): Record<string, StepRuntimeState> {
  const states: Record<string, StepRuntimeState> = {};
  for (const step of plan.steps) {
    states[step.id] = { status: 'pending', attempts: 0, updatedAt: now };
  }
  return states;
}

/**
 * Records a warning when a managed-worktree loop has a dependency edge between a
 * background-agent step and an active-session step — those targets see different
 * filesystem roots. Non-blocking (D-06).
 */
export function computeWarnings(host: OrchestratorHost, loop: Loop): LoopWarning[] {
  if (!loop.workspace.useManagedWorktree) return [];
  const typeById = new Map(loop.plan.steps.map((s) => [s.id, s.execution.type]));
  const mixed = loop.plan.steps.some((step) =>
    (step.dependsOn ?? []).some((dep) => {
      const a = step.execution.type;
      const b = typeById.get(dep);
      return (
        (a === 'background-agent' && b === 'active-session') ||
        (a === 'active-session' && b === 'background-agent')
      );
    }),
  );
  if (!mixed) return [];
  return [
    {
      id: host.newId('warning'),
      code: 'mixed-workspace-targets',
      message:
        'This loop mixes background-agent and active-session steps with dependencies between them. ' +
        'Background-agent work runs in the managed worktree while active-session work runs in the live ' +
        'workspace root, so they see different files.',
      createdAt: host.now(),
    },
  ];
}

/**
 * Strips always-on default-tool names from each background-agent step's tools so
 * the stored `execution.tools` holds only the extras — matching the user-edit
 * path (applyStepTools). The runtime re-adds the default tools at run time.
 */
function normalizePlanStepTools(plan: LoopPlan): LoopPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      if (step.execution.type !== 'background-agent' || !step.execution.tools) return step;
      const extras = step.execution.tools.filter((t) => !isDefaultTool(t));
      return { ...step, execution: { ...step.execution, tools: extras.length > 0 ? extras : undefined } };
    }),
  };
}

/**
 * Applies a successful PlanningResponse to a draft loop. An explicit
 * `options.triggers` wins; otherwise the dedicated trigger extraction (cadence
 * and/or events derived from the goal) is folded into the planner's suggested
 * triggers so the loop is wired even when the planner omitted the trigger.
 */
export function applyPlanningResponse(
  host: OrchestratorHost,
  draft: Loop,
  response: PlanningResponse,
  options?: CreateLoopOptions,
  userTitle?: string,
  extraction?: TriggerExtraction,
): Loop {
  const now = host.now();
  const suggestions = options?.triggers
    ?? mergeExtractedTriggers(response.suggestedTriggers, extraction ?? NO_TRIGGERS);
  const triggers = materializeTriggers(host, draft.id, suggestions);
  const limits = mergeLimits(response.suggestedLimits, options?.limits);
  const plan = normalizePlanStepTools(response.plan);

  const withPlan: Loop = {
    ...draft,
    title: userTitle ?? response.title,
    summary: response.summary,
    plan,
    triggers,
    limits,
    runtime: {
      ...draft.runtime,
      stepStates: initStepStates(plan, now),
      block: undefined,
    },
    updatedAt: now,
  };
  return { ...withPlan, warnings: computeWarnings(host, withPlan) };
}

/**
 * Sets (or clears) one step's model preference — the user override for the tier
 * the planner picked. `model`/`thinking` are a tier ("LOW"/"MED"/"HIGH") or a
 * "provider/modelId" ref; passing an empty/undefined `model` reverts the step to
 * the orchestrator default. Only background-agent and model steps carry a model
 * (active-session steps run in the user's live session).
 */
export function applyStepModel(
  loop: Loop,
  stepId: string,
  model: string | undefined,
  thinking: string | undefined,
  now: string,
): { ok: boolean; loop?: Loop; error?: string } {
  const step = loop.plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: `Step not found: ${stepId}` };
  if (step.execution.type !== 'background-agent' && step.execution.type !== 'model') {
    return { ok: false, error: `Step "${stepId}" (${step.execution.type}) has no model to set.` };
  }
  const execution = { ...step.execution, model: model?.trim() || undefined, thinking: thinking?.trim() || undefined };
  const steps = loop.plan.steps.map((s) => (s.id === stepId ? { ...s, execution } : s));
  const next: Loop = { ...loop, plan: { ...loop.plan, steps }, updatedAt: now };
  // On a library-linked loop, mirror the pick into the overlay so a later version
  // switch (which replaces the plan) keeps it. See specs/08-loop-library.md.
  if (next.libraryLink) next.stepOverrides = mergeStepOverride(next.stepOverrides, stepId, { model: execution.model, thinking: execution.thinking });
  return { ok: true, loop: next };
}

/**
 * Sets (or clears) one background-agent step's EXTRA tools — the tools layered on
 * top of the always-on default tools (which can't be removed). Default-tool names
 * are stripped (they're implicit); an empty result clears the field (defaults
 * only). Only background-agent steps carry tools (model steps are pure reasoning;
 * active-session steps run in the user's live session).
 */
export function applyStepTools(
  loop: Loop,
  stepId: string,
  tools: string[] | undefined,
  now: string,
): { ok: boolean; loop?: Loop; error?: string } {
  const step = loop.plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: `Step not found: ${stepId}` };
  if (step.execution.type !== 'background-agent') {
    return { ok: false, error: `Step "${stepId}" (${step.execution.type}) has no tools to set.` };
  }
  const extras = tools?.map((t) => t.trim()).filter((t) => t && !isDefaultTool(t));
  const execution = { ...step.execution, tools: extras && extras.length > 0 ? extras : undefined };
  const steps = loop.plan.steps.map((s) => (s.id === stepId ? { ...s, execution } : s));
  const next: Loop = { ...loop, plan: { ...loop.plan, steps }, updatedAt: now };
  if (next.libraryLink) next.stepOverrides = mergeStepOverride(next.stepOverrides, stepId, { tools: execution.tools });
  return { ok: true, loop: next };
}

/**
 * Sets (or clears) one background-agent step's named agent role — the specialist
 * the step runs as (planner-picked or user-chosen). An empty/undefined value
 * reverts the step to the default ad-hoc agent. Only background-agent steps carry
 * an agent (model steps are pure reasoning; active-session runs in the user's live
 * session). Membership isn't checked here — an unknown role falls back to the
 * default with a warning at run time (spec 11).
 */
export function applyStepAgent(
  loop: Loop,
  stepId: string,
  agent: string | undefined,
  now: string,
): { ok: boolean; loop?: Loop; error?: string } {
  const step = loop.plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: `Step not found: ${stepId}` };
  if (step.execution.type !== 'background-agent') {
    return { ok: false, error: `Step "${stepId}" (${step.execution.type}) has no agent to set.` };
  }
  const execution = { ...step.execution, agent: agent?.trim() || undefined };
  const steps = loop.plan.steps.map((s) => (s.id === stepId ? { ...s, execution } : s));
  const next: Loop = { ...loop, plan: { ...loop.plan, steps }, updatedAt: now };
  if (next.libraryLink) next.stepOverrides = mergeStepOverride(next.stepOverrides, stepId, { agent: execution.agent });
  return { ok: true, loop: next };
}

/**
 * Sets (or clears) the loop's user context override — custom instructions plus
 * disabled tools/skills applied to its background subagents. A `null` override
 * reverts the loop to the default context. User-level only (never the planner).
 */
export function applyLoopContext(
  loop: Loop,
  overrides: ContextOverrides | null,
  now: string,
): Loop {
  const next: Loop = { ...loop, updatedAt: now };
  if (overrides) next.contextOverrides = overrides;
  else delete next.contextOverrides;
  return next;
}

/**
 * Sets the loop's delivery destination + params — a user-level setting, exactly
 * like worktree placement (the planner never chooses it). Validated
 * structurally; the next planning pass (create/revise) turns it into steps.
 */
export function applyLoopDelivery(
  loop: Loop,
  delivery: LoopDeliverySettings,
  now: string,
): { ok: boolean; loop?: Loop; error?: string } {
  const errors = validateDeliverySettings(delivery);
  if (errors.length > 0) return { ok: false, error: errors.join('; ') };
  return { ok: true, loop: { ...loop, delivery, updatedAt: now } };
}

/** True when a loop's plan is structurally valid and not validation-blocked. */
export function planIsActivatable(loop: Loop): { ok: boolean; error?: string } {
  if (loop.runtime.block?.kind === 'validation-error') {
    return { ok: false, error: `Plan has validation errors: ${loop.runtime.block.reason}` };
  }
  // Re-check the external approval shape too: the destination may have changed
  // (set_delivery) since planning, and an external plan without a gate step
  // could never deliver anyway (the receipt gate would refuse every completion).
  const errors = [...validateLoopPlan(loop.plan), ...approvalGateProblems(loop.plan, effectiveDelivery(loop))];
  if (errors.length > 0) return { ok: false, error: `Plan is invalid: ${errors.join('; ')}` };
  return { ok: true };
}
