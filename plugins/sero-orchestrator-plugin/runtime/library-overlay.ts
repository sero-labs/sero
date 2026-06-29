/**
 * Local per-step override overlay for library-linked loops (specs/08-loop-library.md).
 *
 * A step's model/tool picks live inside the plan, so replacing the plan on a
 * version switch would wipe them. We mirror the user's picks into
 * `loop.stepOverrides` and replay them onto the new version's plan, so structural
 * updates come from the library while local model/tool tuning survives.
 */

import type { LoopPlan, StepOverride } from '../shared/types';

/**
 * Merges a per-step override patch into the overlay, pruning undefined fields
 * (a cleared pick) and dropping an entry that becomes empty. Returns undefined
 * when no overrides remain.
 */
export function mergeStepOverride(
  current: Record<string, StepOverride> | undefined,
  stepId: string,
  patch: StepOverride,
): Record<string, StepOverride> | undefined {
  const next: Record<string, StepOverride> = { ...current };
  const merged = { ...next[stepId], ...patch };
  const cleaned: StepOverride = {};
  if (merged.model !== undefined) cleaned.model = merged.model;
  if (merged.thinking !== undefined) cleaned.thinking = merged.thinking;
  if (merged.tools !== undefined) cleaned.tools = merged.tools;
  if (Object.keys(cleaned).length === 0) delete next[stepId];
  else next[stepId] = cleaned;
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * Replays the overlay onto a plan after a version switch. A local pick wins over
 * the version's value; picks for steps absent in the new plan are reported as
 * `dropped` (so the caller can warn).
 */
export function replayStepOverrides(
  plan: LoopPlan,
  overrides: Record<string, StepOverride> | undefined,
): { plan: LoopPlan; dropped: string[] } {
  if (!overrides || Object.keys(overrides).length === 0) return { plan, dropped: [] };
  const ids = new Set(plan.steps.map((s) => s.id));
  const dropped = Object.keys(overrides).filter((id) => !ids.has(id));
  const steps = plan.steps.map((step) => {
    const ov = overrides[step.id];
    if (!ov) return step;
    if (step.execution.type === 'background-agent') {
      return {
        ...step,
        execution: {
          ...step.execution,
          model: ov.model ?? step.execution.model,
          thinking: ov.thinking ?? step.execution.thinking,
          tools: ov.tools ?? step.execution.tools,
        },
      };
    }
    if (step.execution.type === 'model') {
      return { ...step, execution: { ...step.execution, model: ov.model ?? step.execution.model, thinking: ov.thinking ?? step.execution.thinking } };
    }
    return step;
  });
  return { plan: { ...plan, steps }, dropped };
}
