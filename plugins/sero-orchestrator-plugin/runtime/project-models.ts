/**
 * Applies a created Workflow's or Room's project model snapshot to one call.
 *
 * A snapshot is taken before planning and kept with the creation request, so
 * later steps, retries and recurring runs of the same dispatch keep resolving
 * the models the project had when it was created, even after global defaults
 * change. An explicit caller choice always wins: the snapshot only fills in a
 * tier or an unspecified preference.
 */

import type { ModelTier, OrchestratorProjectModelSnapshot } from '@sero-ai/common';
import { MODEL_TIERS, modelKey } from '@sero-ai/common';

export interface SnapshotApplication {
  model: string | undefined;
  thinking: string | undefined;
  /** True when the snapshot chose the model, for provenance. */
  fromSnapshot: boolean;
}

function tierOf(requested: string | undefined): ModelTier | null {
  if (!requested) return 'MED';
  return MODEL_TIERS.includes(requested as ModelTier) ? (requested as ModelTier) : null;
}

/**
 * Resolves one requested model against a project snapshot.
 *
 * - An explicit `provider/modelId` is a caller pin and passes through untouched.
 * - A tier label, or no preference at all, resolves from the snapshot.
 * - Without a snapshot entry the request passes through for the host to resolve.
 */
export function applyProjectSnapshot(
  snapshot: OrchestratorProjectModelSnapshot | undefined,
  requested: string | undefined,
): SnapshotApplication {
  // A pin is any reference the catalogue would recognise, not a tier label.
  if (requested && requested.includes('/')) {
    return { model: requested, thinking: undefined, fromSnapshot: false };
  }
  const tier = tierOf(requested);
  const entry = tier ? snapshot?.[tier] : undefined;
  if (!entry) return { model: requested, thinking: undefined, fromSnapshot: false };
  return {
    model: modelKey(entry.provider, entry.modelId),
    thinking: entry.thinkingLevel,
    fromSnapshot: true,
  };
}

/** The provenance a run record keeps for one call, so the inspector can show why. */
export function snapshotSource(
  snapshot: OrchestratorProjectModelSnapshot | undefined,
  requested: string | undefined,
): string | undefined {
  if (requested && requested.includes('/')) return 'explicit pin';
  const tier = tierOf(requested);
  return tier ? snapshot?.[tier]?.source : undefined;
}
