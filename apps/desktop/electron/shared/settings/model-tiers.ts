/**
 * Model tier settings — read/write helpers for LOW/MED/HIGH tier
 * configuration in settings.json.
 *
 * Tiers are stored under `sero.modelTiers` in the global settings object.
 */

import type { ModelTier, ModelTierEntry, ModelTierSettings } from '../../../src/types/ipc';

export const MODEL_TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;

function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Read the model tier settings from a settings object. */
export function getModelTiers(settings: Record<string, unknown>): ModelTierSettings {
  const sero = getSeroSettings(settings);
  const raw = sero.modelTiers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: ModelTierSettings = {};
  for (const tier of MODEL_TIERS) {
    const entry = (raw as Record<string, unknown>)[tier];
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).provider === 'string' &&
      typeof (entry as Record<string, unknown>).modelId === 'string'
    ) {
      result[tier] = entry as ModelTierEntry;
    }
  }
  return result;
}

/** Write model tier settings into a settings object (returns new object). */
export function setModelTiers(
  settings: Record<string, unknown>,
  tiers: ModelTierSettings,
): Record<string, unknown> {
  const sero = getSeroSettings(settings);
  return {
    ...settings,
    sero: {
      ...sero,
      modelTiers: tiers,
    },
  };
}
