/**
 * Loop run warnings — amber, non-fatal notices surfaced on a loop after a run.
 * Each is recorded per step (replacing any prior one for the same step) and
 * cleared at the start of the next run. Kept out of run-engine.ts (500-LOC limit).
 */

import type { Loop, LoopWarning } from '../shared/types';
import type { OrchestratorHost } from './host';

function stepTitle(loop: Loop, stepId: string): string {
  return loop.plan.steps.find((s) => s.id === stepId)?.title ?? stepId;
}

function withWarning(loop: Loop, stepId: string, warning: LoopWarning): Loop {
  const kept = loop.warnings.filter((w) => !(w.code === warning.code && w.stepId === stepId));
  return { ...loop, warnings: [...kept, warning] };
}

/** A step's pinned model was unavailable and the MED tier was used instead. */
export function recordModelWarning(host: OrchestratorHost, loop: Loop, stepId: string, requestedModel: string): Loop {
  return withWarning(loop, stepId, {
    id: host.newId('warning'),
    code: 'model-unavailable',
    stepId,
    message: `Step "${stepTitle(loop, stepId)}" requested model "${requestedModel}", which isn't available — using the MED tier instead.`,
    createdAt: host.now(),
  });
}

/** A step's chosen agent role was unavailable and the default ad-hoc agent ran. */
export function recordAgentWarning(host: OrchestratorHost, loop: Loop, stepId: string, requestedAgent: string): Loop {
  return withWarning(loop, stepId, {
    id: host.newId('warning'),
    code: 'agent-unavailable',
    stepId,
    message: `Step "${stepTitle(loop, stepId)}" requested agent "${requestedAgent}", which isn't available — using the default agent instead.`,
    createdAt: host.now(),
  });
}
