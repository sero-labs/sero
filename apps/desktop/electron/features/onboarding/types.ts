import type {
  AvailableModelGroup,
  ModelTier,
  ModelTierEntry,
  ModelTierSettings,
  OnboardingRecommendation,
  OnboardingState,
  OnboardingTierSource,
  ProviderHealthInfo,
  ProviderModelDefaults,
  ResolvedProviderDefaultsState,
} from '../../../src/types/ipc';

export type {
  OnboardingRecommendation,
  OnboardingState,
  OnboardingTierSource,
  ProviderHealthInfo,
  ProviderModelDefaults,
  ResolvedProviderDefaultsState,
} from '../../../src/types/ipc';

export const ONBOARDING_TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;

export interface AvailableModelRecord {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
}

export interface ValidatedTierResult {
  validTiers: ModelTierSettings;
  invalidTiers: ModelTier[];
}

export interface RecommendationContext {
  availableModelGroups: AvailableModelGroup[];
  currentTiers: ModelTierSettings;
  providerHealth: ProviderHealthInfo[];
  providerDefaults: ResolvedProviderDefaultsState;
  legacyDefaultProvider?: string | null;
}

export interface TierSelectionResult {
  entry: ModelTierEntry;
  source: OnboardingTierSource;
}

export function flattenAvailableModels(groups: AvailableModelGroup[]): AvailableModelRecord[] {
  return groups.flatMap((group) => group.models.map((model) => ({
    provider: model.provider,
    modelId: model.modelId,
    name: model.name,
    reasoning: model.reasoning,
  })));
}

export function hasTierEntry(
  groups: AvailableModelGroup[],
  entry: ModelTierEntry,
): boolean {
  return groups.some((group) =>
    group.provider === entry.provider
    && group.models.some((model) => model.modelId === entry.modelId),
  );
}

export function findModelName(
  groups: AvailableModelGroup[],
  entry: ModelTierEntry,
): string {
  for (const group of groups) {
    if (group.provider !== entry.provider) continue;
    const model = group.models.find((candidate) => candidate.modelId === entry.modelId);
    if (model) return model.name;
  }
  return entry.modelId;
}

export function buildRecommendation(
  tiers: ModelTierSettings,
  sourcesByTier: Partial<Record<ModelTier, OnboardingTierSource>>,
  preferredProvider?: string,
): OnboardingRecommendation {
  return {
    tiers,
    sourcesByTier,
    preferredProvider,
  };
}

export function emptyOnboardingState(): OnboardingState {
  return {
    needed: false,
    phase: 'done',
    hasAnyUsableModels: false,
    hasImportedCredentials: false,
    memoryBootstrapComplete: false,
    recommendation: null,
    providerHealth: [],
    availableModelGroups: [],
    warnings: [],
    invalidTiers: [],
  };
}
