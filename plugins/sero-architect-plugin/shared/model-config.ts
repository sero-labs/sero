// Project model configuration: tier overrides that sit above the global
// selection, plus the effective resolution both the UI and the runtime read.
//
// Pure record transforms. Persisting them goes through the record store, which
// is the single writer.

import type { SharedModelTierEntry, SharedModelTierSettings, ModelTier } from '@sero-ai/common';
import { MODEL_TIERS } from '@sero-ai/common';

import type { ProjectRecord } from './record';

/** Why a tier resolved to the entry it did. */
export type TierSelectionSource = 'project-override' | 'inherited-global';

export interface ResolvedTier {
  tier: ModelTier;
  entry: SharedModelTierEntry;
  source: TierSelectionSource;
}

/** The project override for one tier, or undefined when the tier inherits. */
export function projectOverride(record: ProjectRecord, tier: ModelTier): SharedModelTierEntry | undefined {
  return record.modelOverrides?.[tier];
}

/**
 * Resolves each tier from the project override first, then the global selection.
 * A tier with neither is absent from the result: the caller decides whether that
 * is a refusal or a fallback, and never guesses a provider here.
 */
export function resolveEffectiveTiers(record: ProjectRecord): ResolvedTier[] {
  const resolved: ResolvedTier[] = [];
  for (const tier of MODEL_TIERS) {
    const override = projectOverride(record, tier);
    if (override) {
      resolved.push({ tier, entry: override, source: 'project-override' });
      continue;
    }
    const global = record.modelTiers?.[tier];
    if (global) resolved.push({ tier, entry: global, source: 'inherited-global' });
  }
  return resolved;
}

/** The effective entry for one tier, or undefined when nothing selects it. */
export function effectiveTier(record: ProjectRecord, tier: ModelTier): ResolvedTier | undefined {
  return resolveEffectiveTiers(record).find((entry) => entry.tier === tier);
}

/**
 * Saves one tier override. The configuration revision advances so an operation
 * can record the revision it resolved against.
 */
export function setProjectTierOverride(
  record: ProjectRecord,
  tier: ModelTier,
  entry: SharedModelTierEntry,
): ProjectRecord {
  return {
    ...record,
    modelOverrides: { ...(record.modelOverrides ?? {}), [tier]: entry },
    modelConfigRevision: (record.modelConfigRevision ?? 0) + 1,
  };
}

/** Clears one tier override, so the tier inherits the global selection again. */
export function clearProjectTierOverride(record: ProjectRecord, tier: ModelTier): ProjectRecord {
  const next: SharedModelTierSettings = { ...(record.modelOverrides ?? {}) };
  delete next[tier];
  return {
    ...record,
    modelOverrides: next,
    modelConfigRevision: (record.modelConfigRevision ?? 0) + 1,
  };
}

/** True when the record carries at least one project override. */
export function hasProjectOverrides(record: ProjectRecord): boolean {
  return MODEL_TIERS.some((tier) => projectOverride(record, tier) !== undefined);
}
