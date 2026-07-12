import { describe, expect, it } from 'vitest';
import {
  formatModelValidationWarning,
  getAvailableThinkingLevels,
  resolveSupportedThinkingLevel,
  validateAgentModelConfig,
  validateGlobalTierSelections,
  type SharedAvailableModelGroup,
} from '@sero-ai/common';

const groups: SharedAvailableModelGroup[] = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: 'brain',
    models: [
      {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        reasoning: true,
        availableThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
      },
      {
        provider: 'anthropic',
        modelId: 'claude-haiku-3',
        name: 'Claude Haiku 3',
        reasoning: false,
      },
    ],
  },
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: 'sparkles',
    models: [
      {
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        reasoning: true,
        availableThinkingLevels: ['low', 'medium'],
      },
    ],
  },
];

describe('model-selection shared contracts', () => {
  it('derives available thinking levels from explicit model metadata and reasoning defaults', () => {
    expect(getAvailableThinkingLevels(groups[0].models[0])).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(getAvailableThinkingLevels(groups[0].models[1])).toEqual(['off']);
    expect(getAvailableThinkingLevels(groups[1].models[0])).toEqual(['off', 'low', 'medium']);
  });

  it('infers the top thinking level from supportsXhigh/supportsMax when no explicit list is given', () => {
    const base = { provider: 'p', modelId: 'm', name: 'M', reasoning: true };
    expect(getAvailableThinkingLevels(base)).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
    expect(getAvailableThinkingLevels({ ...base, supportsXhigh: true })).toEqual([
      'off', 'minimal', 'low', 'medium', 'high', 'xhigh',
    ]);
    expect(getAvailableThinkingLevels({ ...base, supportsXhigh: true, supportsMax: true })).toEqual([
      'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
    ]);
    expect(resolveSupportedThinkingLevel({ ...base, supportsXhigh: true, supportsMax: true }, 'max')).toBe('max');
  });

  it('falls back to the nearest supported thinking level', () => {
    expect(resolveSupportedThinkingLevel(groups[1].models[0], 'xhigh')).toBe('medium');
    expect(resolveSupportedThinkingLevel(groups[0].models[0], 'max')).toBe('max');
    expect(resolveSupportedThinkingLevel(groups[0].models[1], 'high')).toBe('off');
  });

  it('returns data-first global tier warnings and formats them at render time', () => {
    const warnings = validateGlobalTierSelections(
      {
        HIGH: {
          provider: 'openai',
          modelId: 'missing-model',
          thinkingLevel: 'high',
        },
        MED: {
          provider: 'openai',
          modelId: 'gpt-4o-mini',
          thinkingLevel: 'xhigh',
        },
      },
      groups,
    );

    expect(warnings).toEqual([
      {
        code: 'unsupported_tier_thinking',
        severity: 'warning',
        tier: 'MED',
        modelName: 'GPT-4o Mini',
        requestedThinkingLevel: 'xhigh',
        maxSupportedThinkingLevel: 'medium',
      },
      {
        code: 'missing_global_tier',
        severity: 'warning',
        tier: 'HIGH',
        provider: 'openai',
        modelId: 'missing-model',
      },
    ]);
    expect(formatModelValidationWarning(warnings[0])).toBe('MED thinking is xhigh, but GPT-4o Mini only supports up to medium.');
    expect(formatModelValidationWarning(warnings[1])).toBe('HIGH is set to openai/missing-model, but that model is not currently available.');
  });

  it('reports structured agent fallback warnings without embedding UI copy in the contract', () => {
    const [warning] = validateAgentModelConfig(
      {
        prefer: 'openai/missing-model',
        fallbacks: ['anthropic/claude-sonnet-4'],
      },
      groups,
      {},
    );

    expect(warning).toEqual({
      code: 'agent_fallback_only',
      severity: 'info',
      preferredLabel: 'openai/missing-model',
      fallbackLabel: 'anthropic/claude-sonnet-4',
    });
    expect(formatModelValidationWarning(warning)).toBe(
      "This agent's preferred model (openai/missing-model) is unavailable. Runtime will fall back to anthropic/claude-sonnet-4.",
    );
  });
});
