import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  getModelTierThinkingLevel,
  normalizeThinkingLevel,
  validateGlobalTierSelections,
  type SharedAvailableModelGroup,
  type SharedModelInfo,
} from '@sero/common';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type {
  GlobalModelConfigInput,
  GlobalModelConfigState,
  ModelTier,
  ModelTierEntry,
  ModelTierSettings,
} from '../../../src/types/ipc';
import { SERO_FIXED_ROOT } from '../../platform/env';
import { MODEL_TIERS, getModelTiers, setModelTiers } from './model-tiers';

const LEGACY_PROVIDER_DEFAULTS_PATH = path.join(SERO_FIXED_ROOT, 'provider-model-defaults.json');

function parseLegacyProviderDefaults(
  value: unknown,
): Record<string, Partial<Record<ModelTier, string>>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: Record<string, Partial<Record<ModelTier, string>>> = {};
  for (const [providerId, tiers] of Object.entries(value as Record<string, unknown>)) {
    if (!providerId.trim() || !tiers || typeof tiers !== 'object' || Array.isArray(tiers)) continue;
    const normalized: Partial<Record<ModelTier, string>> = {};
    for (const tier of MODEL_TIERS) {
      const rawModelId = (tiers as Record<string, unknown>)[tier];
      if (typeof rawModelId !== 'string' || !rawModelId.trim()) continue;
      normalized[tier] = rawModelId.trim();
    }
    if (Object.keys(normalized).length > 0) {
      result[providerId.trim()] = normalized;
    }
  }

  return result;
}

function getLegacyDefaultThinkingLevel(settings: Record<string, unknown>): ThinkingLevel {
  const value = settings.defaultThinkingLevel;
  return normalizeThinkingLevel(typeof value === 'string' ? value : undefined);
}

function normalizeTierEntry(entry: ModelTierEntry, fallbackThinkingLevel: string): ModelTierEntry {
  return {
    provider: entry.provider,
    modelId: entry.modelId,
    thinkingLevel: getModelTierThinkingLevel(entry, fallbackThinkingLevel),
  };
}

function normalizeTierSettings(
  tiers: ModelTierSettings,
  fallbackThinkingLevel: string,
): ModelTierSettings {
  const result: ModelTierSettings = {};

  for (const tier of MODEL_TIERS) {
    const entry = tiers[tier];
    if (!entry) continue;
    result[tier] = normalizeTierEntry(entry, fallbackThinkingLevel);
  }

  return result;
}

function getPrimaryThinkingLevel(
  tiers: ModelTierSettings,
  fallbackThinkingLevel: string,
): ThinkingLevel {
  return tiers.HIGH?.thinkingLevel
    ?? tiers.MED?.thinkingLevel
    ?? tiers.LOW?.thinkingLevel
    ?? normalizeThinkingLevel(fallbackThinkingLevel);
}

export function readLegacyProviderDefaults(): Record<string, Partial<Record<ModelTier, string>>> {
  try {
    if (!existsSync(LEGACY_PROVIDER_DEFAULTS_PATH)) return {};
    const raw = JSON.parse(readFileSync(LEGACY_PROVIDER_DEFAULTS_PATH, 'utf8')) as unknown;
    return parseLegacyProviderDefaults(raw);
  } catch {
    return {};
  }
}

export function deriveTierSelectionsFromLegacyDefaults(
  defaults: Record<string, Partial<Record<ModelTier, string>>>,
): { tiers: ModelTierSettings; migrationNotice?: string } {
  const tiers: ModelTierSettings = {};
  const partialTiers: ModelTier[] = [];

  for (const tier of MODEL_TIERS) {
    const matches = Object.entries(defaults)
      .map(([provider, providerTiers]) => {
        const modelId = providerTiers[tier];
        return modelId ? { provider, modelId } : null;
      })
      .filter((entry): entry is { provider: string; modelId: string } => entry !== null);

    if (matches.length === 1) {
      tiers[tier] = matches[0];
      continue;
    }

    if (matches.length > 1) {
      partialTiers.push(tier);
    }
  }

  if (partialTiers.length === 0) {
    return { tiers };
  }

  return {
    tiers,
    migrationNotice: `Some legacy provider defaults could not be migrated automatically (${partialTiers.join(', ')} had multiple provider overrides).`,
  };
}

export function getGlobalModelConfigTiers(settings: Record<string, unknown>): ModelTierSettings {
  return normalizeTierSettings(getModelTiers(settings), getLegacyDefaultThinkingLevel(settings));
}

export function setGlobalModelConfig(
  settings: Record<string, unknown>,
  config: GlobalModelConfigInput,
): Record<string, unknown> {
  const tiers = normalizeTierSettings(config.tiers, getLegacyDefaultThinkingLevel(settings));
  return {
    ...setModelTiers(settings, tiers),
    defaultThinkingLevel: getPrimaryThinkingLevel(tiers, getLegacyDefaultThinkingLevel(settings)),
  };
}

export function buildGlobalModelConfigState<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  settings: Record<string, unknown>,
  groups: TGroup[],
  migrationNotice?: string,
): GlobalModelConfigState {
  const tiers = getGlobalModelConfigTiers(settings);
  const warnings = validateGlobalTierSelections(tiers, groups);

  return {
    tiers,
    warnings,
    migrationNotice,
  };
}
