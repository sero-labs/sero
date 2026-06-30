/**
 * Resolves a step's chosen model to the string passed to the runtime, applying
 * the MED-tier fallback when a pinned model is no longer available.
 *
 * A step's `execution.model` is one of:
 *  - undefined   → no preference; the run uses the session/agent default.
 *  - a tier       → 'LOW' | 'MED' | 'HIGH'. The subagent runner maps a tier to
 *                   the user's configured tier model, so a tier always resolves
 *                   to something usable (worst case, the session default).
 *  - a model ref  → 'provider/modelId' (or a bare model id); pinned by the user.
 *
 * Only a pinned ref can go missing at run time (a provider key was removed, a
 * model was retired). When the ref is not in the available set we fall back to
 * the MED tier and report it so the loop can surface a warning.
 */

import { findModelByReference, isModelTier, type SharedAvailableModelGroup } from '@sero-ai/common';

/** The tier a pinned-but-unavailable model falls back to. */
export const FALLBACK_TIER = 'MED';

export interface ResolvedStepModel {
  /** The model string to pass to runStructured (undefined = host/session default). */
  model?: string;
  /** Set when a pinned model was unavailable and replaced by the MED tier. */
  fallbackFrom?: string;
}

/**
 * Resolves a step's model preference against the machine's available models.
 * Tiers and "no preference" pass through unchanged; a pinned model that is no
 * longer available is replaced by the MED tier with `fallbackFrom` set.
 */
export function resolveStepModel(
  model: string | undefined,
  groups: SharedAvailableModelGroup[],
): ResolvedStepModel {
  if (!model) return {};
  if (isModelTier(model)) return { model };
  if (findModelByReference(groups, model)) return { model };
  return { model: FALLBACK_TIER, fallbackFrom: model };
}
