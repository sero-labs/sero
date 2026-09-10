/**
 * Resolves a step's chosen model to the string passed to the runtime.
 *
 * A step's `execution.model` is one of:
 *  - undefined   → no preference; the run uses the session/agent default.
 *  - a tier       → 'LOW' | 'MED' | 'HIGH'. The subagent runner maps a tier to
 *                   the user's configured tier model, so a tier always resolves
 *                   to something usable (worst case, the session default).
 *  - a model ref  → 'provider/modelId' (or a bare model id); pinned by the user.
 *
 * Only a pinned ref can go missing at run time (a provider key was removed, a
 * model was retired). When the ref is not in the available set, the caller must
 * stop before starting a worker instead of silently changing provider authority.
 */

import { findModelByReference, isModelTier, type SharedAvailableModelGroup } from '@sero-ai/common';

export interface ResolvedStepModel {
  /** The model string to pass to runStructured (undefined = host/session default). */
  model?: string;
  /** Set when a pinned model is unavailable and execution must stop. */
  unavailableModel?: string;
}

export function unavailableModelReason(model: string): string {
  return `Model "${model}" is unavailable. Restore that model/provider or select an authorized available model for this step, then retry the step. No worker was started.`;
}

/**
 * Resolves a step's model preference against the machine's available models.
 * Tiers and "no preference" pass through unchanged; an unavailable pinned model
 * is returned for the executor to block before it starts a worker.
 */
export function resolveStepModel(
  model: string | undefined,
  groups: SharedAvailableModelGroup[],
): ResolvedStepModel {
  if (!model) return {};
  if (isModelTier(model)) return { model };
  if (findModelByReference(groups, model)) return { model };
  return { unavailableModel: model };
}
