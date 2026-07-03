/**
 * Coordinator-facing handlers for the user-override actions (`set_step_model`,
 * `set_step_tools`, `set_step_agent`, `set_loop_context`, `set_delivery`).
 * Kept out of coordinator.ts (500-LOC limit); the coordinator delegates the
 * whole group here. Each is a pure per-loop mapping applied and persisted —
 * overrides take effect on the next run.
 */

import type { Loop, OrchestratorAction, OrchestratorActionResult } from '../shared/types';
import type { OrchestratorHost } from './host';
import { voidOpenApprovals } from './delivery/delivery-contract';
import { applyLoopContext, applyLoopDelivery, applyStepAgent, applyStepModel, applyStepTools } from './plan-mapping';

export type OverrideAction = Extract<
  OrchestratorAction,
  { kind: 'set_step_model' | 'set_step_tools' | 'set_step_agent' | 'set_loop_context' | 'set_delivery' }
>;

const OVERRIDE_KINDS: ReadonlySet<string> = new Set([
  'set_step_model',
  'set_step_tools',
  'set_step_agent',
  'set_loop_context',
  'set_delivery',
]);

/** True for every override action — lets the coordinator route them in one line. */
export function isOverrideAction(action: OrchestratorAction): action is OverrideAction {
  return OVERRIDE_KINDS.has(action.kind);
}

function mapOverride(loop: Loop, action: OverrideAction, now: string): { ok: boolean; loop?: Loop; error?: string } {
  switch (action.kind) {
    case 'set_step_model':
      return applyStepModel(loop, action.stepId, action.model, action.thinking, now);
    case 'set_step_tools':
      return applyStepTools(loop, action.stepId, action.tools, now);
    case 'set_step_agent':
      return applyStepAgent(loop, action.stepId, action.agent, now);
    case 'set_loop_context':
      return { ok: true, loop: applyLoopContext(loop, action.overrides, now) };
    case 'set_delivery': {
      const result = applyLoopDelivery(loop, action.delivery, now);
      if (!result.ok || !result.loop) return result;
      // Changing where (or with what params) the loop delivers voids any open
      // approval: the user approved content for the OLD destination, and an
      // approval token must never authorize a send it was not granted for.
      return { ok: true, loop: { ...result.loop, answeredInputs: voidOpenApprovals(result.loop.answeredInputs, now) } };
    }
  }
}

export async function handleOverrideAction(
  host: OrchestratorHost,
  action: OverrideAction,
): Promise<OrchestratorActionResult> {
  const state = await host.readState();
  const loop = state?.loops.find((l) => l.id === action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };
  const result = mapOverride(loop, action, host.now());
  if (!result.ok || !result.loop) return { ok: false, error: result.error };
  const updated = result.loop;
  await host.updateState((current) => ({
    ...current,
    loops: current.loops.map((l) => (l.id === updated.id ? updated : l)),
  }));
  return { ok: true, loop: updated };
}
