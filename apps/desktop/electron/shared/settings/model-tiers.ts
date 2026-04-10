/**
 * Model tier settings — read/write helpers for LOW/MED/HIGH tier
 * configuration in settings.json.
 *
 * Tiers are stored under `sero.modelTiers` in the global settings object.
 */

import { normalizeThinkingLevel } from '@sero/common';
import type { ModelTier, ModelTierEntry, ModelTierSettings } from '@/types/ipc';
import { getSeroSettings } from './settings-helpers';

export const MODEL_TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;

/** Read the model tier settings from a settings object. */
export function getModelTiers(settings: Record<string, unknown>): ModelTierSettings {
  const sero = getSeroSettings(settings);
  const raw = sero.modelTiers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: ModelTierSettings = {};
  for (const tier of MODEL_TIERS) {
    const entry = (raw as Record<string, unknown>)[tier];
    if (
      !entry
      || typeof entry !== 'object'
      || Array.isArray(entry)
      || typeof (entry as Record<string, unknown>).provider !== 'string'
      || typeof (entry as Record<string, unknown>).modelId !== 'string'
    ) {
      continue;
    }

    const thinkingLevel = typeof (entry as Record<string, unknown>).thinkingLevel === 'string'
      ? normalizeThinkingLevel((entry as Record<string, unknown>).thinkingLevel as string)
      : undefined;

    result[tier] = {
      provider: (entry as Record<string, string>).provider,
      modelId: (entry as Record<string, string>).modelId,
      ...(thinkingLevel ? { thinkingLevel } : {}),
    } satisfies ModelTierEntry;
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
