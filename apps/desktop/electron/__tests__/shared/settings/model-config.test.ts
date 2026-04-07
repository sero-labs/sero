import { describe, expect, it } from 'vitest';
import type { AvailableModelGroup } from '../../../../src/types/ipc';
import {
  buildGlobalModelConfigState,
  deriveTierSelectionsFromLegacyDefaults,
  getGlobalModelConfigTiers,
  setGlobalModelConfig,
} from '../../../shared/settings/model-config';

const availableModelGroups: AvailableModelGroup[] = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: 'openai.svg',
    models: [
      {
        provider: 'openai',
        modelId: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        reasoning: false,
      },
      {
        provider: 'openai',
        modelId: 'gpt-5.4',
        name: 'GPT-5.4',
        reasoning: true,
      },
    ],
  },
];

describe('deriveTierSelectionsFromLegacyDefaults', () => {
  it('migrates unique legacy tier selections and reports ambiguous tiers', () => {
    const result = deriveTierSelectionsFromLegacyDefaults({
      openai: { LOW: 'gpt-4.1-mini', MED: 'gpt-4.1-mini' },
      google: { MED: 'gemini-2.5-pro' },
    });

    expect(result.tiers).toEqual({
      LOW: { provider: 'openai', modelId: 'gpt-4.1-mini' },
    });
    expect(result.migrationNotice).toContain('MED');
  });
});

describe('model config tiers', () => {
  it('inherits missing tier thinking levels from the legacy global default', () => {
    const tiers = getGlobalModelConfigTiers({
      defaultThinkingLevel: 'medium',
      sero: {
        modelTiers: {
          LOW: { provider: 'openai', modelId: 'gpt-4.1-mini' },
        },
      },
    });

    expect(tiers.LOW?.thinkingLevel).toBe('medium');
  });

  it('stores tier thinking levels and warns when a tier exceeds model support', () => {
    const settings = setGlobalModelConfig({}, {
      tiers: {
        LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'high' },
        HIGH: { provider: 'openai', modelId: 'gpt-5.4', thinkingLevel: 'medium' },
      },
    });

    const state = buildGlobalModelConfigState(settings, availableModelGroups);

    expect(settings.defaultThinkingLevel).toBe('medium');
    expect(state.tiers.HIGH?.thinkingLevel).toBe('medium');
    expect(state.warnings.map((warning) => warning.code)).toContain('unsupported_tier_thinking');
  });
});
