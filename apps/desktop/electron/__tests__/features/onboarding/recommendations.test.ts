import { describe, expect, it } from 'vitest';
import type {
  AvailableModelGroup,
  ProviderHealthInfo,
  ResolvedProviderDefaultsState,
} from '../../../../src/types/ipc';
import { buildOnboardingRecommendation } from '../../../features/onboarding/recommendations';

function makeProviderHealth(providerId: string): ProviderHealthInfo {
  return {
    providerId,
    displayName: providerId,
    status: 'healthy',
    canReconnect: false,
    hasUsableModels: true,
    usableModelIds: [],
  };
}

const availableModelGroups: AvailableModelGroup[] = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: 'openai.svg',
    models: [
      { provider: 'openai', modelId: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', reasoning: false },
      { provider: 'openai', modelId: 'gpt-5.4', name: 'GPT-5.4', reasoning: true },
    ],
  },
  {
    provider: 'google',
    displayName: 'Google',
    logo: 'google.svg',
    models: [
      { provider: 'google', modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: false },
      { provider: 'google', modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true },
    ],
  },
];

const providerDefaults: ResolvedProviderDefaultsState = {
  builtInDefaults: {},
  globalDefaults: {
    openai: { LOW: 'gpt-4.1-mini', MED: 'gpt-5.4', HIGH: 'gpt-5.4' },
    google: { LOW: 'gemini-2.5-flash', MED: 'gemini-2.5-pro', HIGH: 'gemini-2.5-pro' },
  },
  effectiveDefaults: {
    openai: { LOW: 'gpt-4.1-mini', MED: 'gpt-5.4', HIGH: 'gpt-5.4' },
    google: { LOW: 'gemini-2.5-flash', MED: 'gemini-2.5-pro', HIGH: 'gemini-2.5-pro' },
  },
};

describe('buildOnboardingRecommendation', () => {
  it('preserves valid tiers and repairs invalid tiers within the preferred provider', () => {
    const result = buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers: {
        LOW: { provider: 'openai', modelId: 'gpt-4.1-mini' },
        MED: { provider: 'openai', modelId: 'missing-model' },
      },
      providerHealth: [makeProviderHealth('openai'), makeProviderHealth('google')],
      providerDefaults,
      legacyDefaultProvider: null,
    });

    expect(result.invalidTiers).toEqual(['MED']);
    expect(result.recommendation?.preferredProvider).toBe('openai');
    expect(result.recommendation?.tiers).toEqual({
      LOW: { provider: 'openai', modelId: 'gpt-4.1-mini' },
      MED: { provider: 'openai', modelId: 'gpt-5.4' },
      HIGH: { provider: 'openai', modelId: 'gpt-5.4' },
    });
    expect(result.recommendation?.sourcesByTier).toEqual({
      LOW: 'preserved',
      MED: 'provider-defaults',
      HIGH: 'provider-defaults',
    });
  });

  it('chooses a cohesive provider recommendation when no tiers are saved yet', () => {
    const result = buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers: {},
      providerHealth: [makeProviderHealth('openai'), makeProviderHealth('google')],
      providerDefaults,
      legacyDefaultProvider: 'openai',
    });

    expect(result.invalidTiers).toEqual([]);
    expect(result.recommendation?.preferredProvider).toBe('openai');
    expect(result.recommendation?.tiers).toEqual({
      LOW: { provider: 'openai', modelId: 'gpt-4.1-mini' },
      MED: { provider: 'openai', modelId: 'gpt-5.4' },
      HIGH: { provider: 'openai', modelId: 'gpt-5.4' },
    });
  });

  it('uses the preserved provider as the recommendation anchor even when another provider has defaults', () => {
    const result = buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers: {
        HIGH: { provider: 'google', modelId: 'gemini-2.5-pro' },
      },
      providerHealth: [makeProviderHealth('openai'), makeProviderHealth('google')],
      providerDefaults,
      legacyDefaultProvider: 'openai',
    });

    expect(result.recommendation?.preferredProvider).toBe('google');
    expect(result.recommendation?.tiers).toEqual({
      LOW: { provider: 'google', modelId: 'gemini-2.5-flash' },
      MED: { provider: 'google', modelId: 'gemini-2.5-pro' },
      HIGH: { provider: 'google', modelId: 'gemini-2.5-pro' },
    });
    expect(result.recommendation?.sourcesByTier?.HIGH).toBe('preserved');
  });
});
