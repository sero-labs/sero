import type { ModelTier } from '@sero-ai/common';

import type { ModelConfigSource } from '../shared/model-config';
import type { ArchitectHost } from './host';
import { projectModelSource, resolveOwnerSelection, type SelectionSource } from './model-resolution';

export interface OwnerModelChoice {
  model: string;
  thinking: string;
  /**
   * Which rule chose it. The page used to state the owner's model in a
   * sentence under the tier table and leave the reader to work out how it
   * related to the tiers above it.
   */
  source: SelectionSource;
  /** The tier the choice takes precedence over, when it is not a tier itself. */
  outranks?: ModelTier;
}

/**
 * Resolve the exact selection before requesting authority. Never choose another provider.
 *
 * With a record, the project's own tier overrides apply, so a project MED
 * override governs the owner unless the environment pin takes precedence.
 * Without one, the global selections resolve exactly as before.
 */
export async function chooseOwnerModel(
  host: Pick<ArchitectHost, 'listModels' | 'modelTiers' | 'env'>,
  source?: ModelConfigSource,
): Promise<OwnerModelChoice> {
  const resolved = await resolveOwnerSelection(
    { listModels: () => host.listModels(), modelTiers: () => host.modelTiers(), env: host.env },
    projectModelSource(source ?? {}, await host.modelTiers()),
  );
  if (!resolved.ok) throw new Error(resolved.error);
  const chosen = resolved.value;
  return {
    model: chosen.model,
    thinking: chosen.thinking,
    source: chosen.source,
    ...(chosen.outranks ? { outranks: chosen.outranks } : {}),
  };
}
