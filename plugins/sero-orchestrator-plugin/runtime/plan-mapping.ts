/**
 * Maps a validated PlanningResponse onto a persisted Loop and derives runtime
 * state (step states, warnings). See 03-execution-and-scheduling.md "Planning
 * Flow" and 01-data-model.md mapping rules.
 */

import type {
  CreateLoopOptions,
  Loop,
  LoopPlan,
  LoopWarning,
  PlanningResponse,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { mergeLimits, materializeTriggers } from './loop-factory';
import { mergeScheduleIntoTriggers, type ScheduleExtraction } from './schedule-extractor';
import { validateLoopPlan } from './schema';

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
 * Applies a successful PlanningResponse to a draft loop. An explicit
 * `options.triggers` wins; otherwise the dedicated schedule extraction (if the
 * goal recurs) is folded into the planner's suggested triggers so a recurring
 * loop is scheduled even when the planner omitted the trigger itself.
 */
export function applyPlanningResponse(
  host: OrchestratorHost,
  draft: Loop,
  response: PlanningResponse,
  options?: CreateLoopOptions,
  userTitle?: string,
  schedule?: ScheduleExtraction,
): Loop {
  const now = host.now();
  const suggestions = options?.triggers
    ?? mergeScheduleIntoTriggers(response.suggestedTriggers, schedule ?? { recurring: false });
  const triggers = materializeTriggers(host, draft.id, suggestions);
  const limits = mergeLimits(response.suggestedLimits, options?.limits);

  const withPlan: Loop = {
    ...draft,
    title: userTitle ?? response.title,
    summary: response.summary,
    plan: response.plan,
    triggers,
    limits,
    runtime: {
      ...draft.runtime,
      stepStates: initStepStates(response.plan, now),
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
  return { ok: true, loop: { ...loop, plan: { ...loop.plan, steps }, updatedAt: now } };
}

/** True when a loop's plan is structurally valid and not validation-blocked. */
export function planIsActivatable(loop: Loop): { ok: boolean; error?: string } {
  if (loop.runtime.block?.kind === 'validation-error') {
    return { ok: false, error: `Plan has validation errors: ${loop.runtime.block.reason}` };
  }
  const errors = validateLoopPlan(loop.plan);
  if (errors.length > 0) return { ok: false, error: `Plan is invalid: ${errors.join('; ')}` };
  return { ok: true };
}
