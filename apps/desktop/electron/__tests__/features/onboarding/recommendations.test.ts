import { describe, expect, it } from 'vitest';
import type {
  AvailableModelGroup,
  ProviderHealthInfo,
} from '@/types/ipc';
import { buildOnboardingRecommendation } from '@electron/features/onboarding/recommendations';

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
      { provider: 'openai', api: 'openai-responses', modelId: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', reasoning: false },
      { provider: 'openai', api: 'openai-responses', modelId: 'gpt-5.4', name: 'GPT-5.4', reasoning: true },
    ],
  },
  {
    provider: 'google',
    displayName: 'Google',
    logo: 'google.svg',
    models: [
      { provider: 'google', api: 'google-generative-ai', modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: false },
      { provider: 'google', api: 'google-generative-ai', modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true },
    ],
  },
];

describe('buildOnboardingRecommendation', () => {
  it('preserves valid tiers and repairs invalid tiers within the preferred provider', () => {
    const result = buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers: {
        LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'off' },
        MED: { provider: 'openai', modelId: 'missing-model', thinkingLevel: 'medium' },
      },
      providerHealth: [makeProviderHealth('openai'), makeProviderHealth('google')],
      legacyDefaultProvider: null,
    });

    expect(result.invalidTiers).toEqual(['MED']);
    expect(result.recommendation?.preferredProvider).toBe('openai');
    expect(result.recommendation?.tiers).toEqual({
      LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'off' },
      MED: { provider: 'openai', modelId: 'gpt-5.4', thinkingLevel: 'medium' },
      HIGH: { provider: 'openai', modelId: 'gpt-5.4', thinkingLevel: 'high' },
    });
    expect(result.recommendation?.sourcesByTier).toEqual({
      LOW: 'preserved',
      MED: 'recommended',
      HIGH: 'recommended',
    });
  });

  it('chooses a cohesive provider recommendation when no tiers are saved yet', () => {
    const result = buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers: {},
      providerHealth: [makeProviderHealth('openai'), makeProviderHealth('google')],
      legacyDefaultProvider: 'openai',
    });

    expect(result.invalidTiers).toEqual([]);
    expect(result.recommendation?.preferredProvider).toBe('openai');
    expect(result.recommendation?.tiers).toEqual({
      LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'off' },
      MED: { provider: 'openai', modelId: 'gpt-5.4', thinkingLevel: 'high' },
      HIGH: { provider: 'openai', modelId: 'gpt-5.4', thinkingLevel: 'high' },
    });
  });

  it('uses the preserved provider as the recommendation anchor even when another provider has defaults', () => {
    const result = buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers: {
        HIGH: { provider: 'google', modelId: 'gemini-2.5-pro', thinkingLevel: 'medium' },
      },
      providerHealth: [makeProviderHealth('openai'), makeProviderHealth('google')],
      legacyDefaultProvider: 'openai',
    });

    expect(result.recommendation?.preferredProvider).toBe('google');
    expect(result.recommendation?.tiers).toEqual({
      LOW: { provider: 'google', modelId: 'gemini-2.5-flash', thinkingLevel: 'off' },
      MED: { provider: 'google', modelId: 'gemini-2.5-pro', thinkingLevel: 'high' },
      HIGH: { provider: 'google', modelId: 'gemini-2.5-pro', thinkingLevel: 'medium' },
    });
    expect(result.recommendation?.sourcesByTier?.HIGH).toBe('preserved');
  });
});
