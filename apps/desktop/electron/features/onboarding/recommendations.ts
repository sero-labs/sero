import type {
  AvailableModelGroup,
  ModelTier,
  ModelTierEntry,
  ModelTierSettings,
  OnboardingRecommendation,
  OnboardingTierSource,
  ProviderModelDefaults,
} from '../../../src/types/ipc';
import {
  ONBOARDING_TIERS,
  buildRecommendation,
  flattenAvailableModels,
  hasTierEntry,
  type AvailableModelRecord,
  type RecommendationContext,
  type TierSelectionResult,
  type ValidatedTierResult,
} from './types';

const TIER_PRIORITY_IDS: Record<ModelTier, string[]> = {
  LOW: ['gpt-4.1-mini', 'claude-haiku-4-5', 'gemini-2.5-flash', 'gemini-3-flash'],
  MED: ['gpt-5.4', 'claude-sonnet-4-6', 'gemini-2.5-pro'],
  HIGH: ['gpt-5.4', 'claude-sonnet-4-6', 'gemini-2.5-pro'],
};

function getProviderModels(
  groups: AvailableModelGroup[],
  providerId: string,
): AvailableModelRecord[] {
  const group = groups.find((candidate) => candidate.provider === providerId);
  if (!group) return [];
  return group.models.map((model) => ({
    provider: model.provider,
    modelId: model.modelId,
    name: model.name,
    reasoning: model.reasoning,
  }));
}

function countTierProviders(tiers: ModelTierSettings): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tier of ONBOARDING_TIERS) {
    const entry = tiers[tier];
    if (!entry) continue;
    counts.set(entry.provider, (counts.get(entry.provider) ?? 0) + 1);
  }
  return counts;
}

function inferPreferredFromValidTiers(tiers: ModelTierSettings): string | null {
  const counts = countTierProviders(tiers);
  let preferred: string | null = null;
  let bestCount = 0;
  let total = 0;

  for (const count of counts.values()) total += count;
  for (const [providerId, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && preferred !== null && providerId.localeCompare(preferred) < 0)) {
      preferred = providerId;
      bestCount = count;
    }
  }

  if (!preferred || total === 0) return null;
  return bestCount >= Math.ceil(total / 2) ? preferred : null;
}

function modelMatches(entry: ModelTierEntry, model: AvailableModelRecord): boolean {
  return entry.provider === model.provider && entry.modelId === model.modelId;
}

function findExactModel(
  models: AvailableModelRecord[],
  modelId: string,
): AvailableModelRecord | null {
  return models.find((model) => model.modelId === modelId) ?? null;
}

function scoreModelForTier(model: AvailableModelRecord, tier: ModelTier): number {
  const haystack = `${model.modelId} ${model.name}`.toLowerCase();
  let score = 0;

  const priorityIndex = TIER_PRIORITY_IDS[tier].findIndex((candidate) => candidate === model.modelId);
  if (priorityIndex >= 0) {
    score += 200 - (priorityIndex * 10);
  }

  const isFast = /mini|haiku|flash|nano|small|instant|fast/.test(haystack);
  const isCapable = /pro|sonnet|opus|max|ultra|reason|thinking|gpt-5/.test(haystack);

  if (tier === 'LOW') {
    if (isFast) score += 45;
    if (isCapable) score -= 20;
    score += model.reasoning ? -5 : 10;
  }

  if (tier === 'MED') {
    if (isCapable) score += 30;
    if (isFast) score -= 5;
    if (model.reasoning) score += 10;
  }

  if (tier === 'HIGH') {
    if (isCapable) score += 45;
    if (isFast) score -= 25;
    if (model.reasoning) score += 20;
  }

  return score;
}

function rankModelsForTier(
  models: AvailableModelRecord[],
  tier: ModelTier,
): AvailableModelRecord[] {
  return [...models].sort((a, b) => {
    const scoreDelta = scoreModelForTier(b, tier) - scoreModelForTier(a, tier);
    if (scoreDelta !== 0) return scoreDelta;
    return (
      a.provider.localeCompare(b.provider)
      || a.name.localeCompare(b.name)
      || a.modelId.localeCompare(b.modelId)
    );
  });
}

function pickFromDefaults(
  providerId: string,
  tier: ModelTier,
  providerDefaults: ProviderModelDefaults,
  groups: AvailableModelGroup[],
): TierSelectionResult | null {
  const defaults = providerDefaults[providerId];
  const modelId = defaults?.[tier];
  if (!modelId) return null;

  const model = findExactModel(getProviderModels(groups, providerId), modelId);
  if (!model) return null;

  return {
    entry: {
      provider: model.provider,
      modelId: model.modelId,
    },
    source: 'provider-defaults',
  };
}

function pickBestModel(models: AvailableModelRecord[], tier: ModelTier): TierSelectionResult | null {
  const best = rankModelsForTier(models, tier)[0];
  if (!best) return null;
  return {
    entry: {
      provider: best.provider,
      modelId: best.modelId,
    },
    source: 'fallback',
  };
}

function scoreProviderCoverage(
  providerId: string,
  groups: AvailableModelGroup[],
  providerDefaults: ProviderModelDefaults,
): number {
  const providerModels = getProviderModels(groups, providerId);
  if (providerModels.length === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  for (const tier of ONBOARDING_TIERS) {
    if (pickFromDefaults(providerId, tier, providerDefaults, groups)) {
      score += 5;
      continue;
    }
    if (pickBestModel(providerModels, tier)) {
      score += 1;
    }
  }

  return score;
}

function pickBestCoverageProvider(
  groups: AvailableModelGroup[],
  providerDefaults: ProviderModelDefaults,
): string | null {
  let preferred: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const group of groups) {
    const score = scoreProviderCoverage(group.provider, groups, providerDefaults);
    if (score > bestScore || (score === bestScore && preferred !== null && group.provider.localeCompare(preferred) < 0)) {
      preferred = group.provider;
      bestScore = score;
    }
  }

  return preferred;
}

function inferPreferredProvider(
  context: RecommendationContext,
  validTiers: ModelTierSettings,
): string | undefined {
  const preferredFromValidTiers = inferPreferredFromValidTiers(validTiers);
  if (preferredFromValidTiers) return preferredFromValidTiers;

  const healthyProviders = new Set(
    context.providerHealth
      .filter((provider) => provider.hasUsableModels)
      .map((provider) => provider.providerId),
  );

  if (context.legacyDefaultProvider && healthyProviders.has(context.legacyDefaultProvider)) {
    return context.legacyDefaultProvider;
  }

  const preferredByCoverage = pickBestCoverageProvider(
    context.availableModelGroups.filter((group) => healthyProviders.has(group.provider)),
    context.providerDefaults.effectiveDefaults,
  );
  return preferredByCoverage ?? undefined;
}

export function validateCurrentTiers(
  groups: AvailableModelGroup[],
  tiers: ModelTierSettings,
): ValidatedTierResult {
  const validTiers: ModelTierSettings = {};
  const invalidTiers: ModelTier[] = [];

  for (const tier of ONBOARDING_TIERS) {
    const entry = tiers[tier];
    if (!entry) continue;
    if (hasTierEntry(groups, entry)) {
      validTiers[tier] = entry;
      continue;
    }
    invalidTiers.push(tier);
  }

  return { validTiers, invalidTiers };
}

function pickTierSelection(
  tier: ModelTier,
  context: RecommendationContext,
  preferredProvider: string | undefined,
  preservedTiers: ModelTierSettings,
): TierSelectionResult | null {
  const preserved = preservedTiers[tier];
  if (preserved) {
    return {
      entry: preserved,
      source: 'preserved',
    };
  }

  if (preferredProvider) {
    const fromDefaults = pickFromDefaults(
      preferredProvider,
      tier,
      context.providerDefaults.effectiveDefaults,
      context.availableModelGroups,
    );
    if (fromDefaults) return fromDefaults;

    const preferredModels = getProviderModels(context.availableModelGroups, preferredProvider);
    const withinProviderFallback = pickBestModel(preferredModels, tier);
    if (withinProviderFallback) return withinProviderFallback;
  }

  const anyModelFallback = pickBestModel(
    flattenAvailableModels(context.availableModelGroups),
    tier,
  );
  return anyModelFallback;
}

export function buildOnboardingRecommendation(context: RecommendationContext): {
  recommendation: OnboardingRecommendation | null;
  invalidTiers: ModelTier[];
} {
  const { validTiers, invalidTiers } = validateCurrentTiers(
    context.availableModelGroups,
    context.currentTiers,
  );

  const preferredProvider = inferPreferredProvider(context, validTiers);
  const tiers: ModelTierSettings = {};
  const sourcesByTier: Partial<Record<ModelTier, OnboardingTierSource>> = {};

  for (const tier of ONBOARDING_TIERS) {
    const selection = pickTierSelection(tier, context, preferredProvider, validTiers);
    if (!selection) continue;
    tiers[tier] = selection.entry;
    sourcesByTier[tier] = selection.source;
  }

  const hasRecommendation = ONBOARDING_TIERS.every((tier) => !!tiers[tier]);
  return {
    recommendation: hasRecommendation
      ? buildRecommendation(tiers, sourcesByTier, preferredProvider)
      : null,
    invalidTiers,
  };
}
