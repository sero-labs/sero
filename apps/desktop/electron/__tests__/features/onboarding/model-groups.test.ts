import { describe, expect, it } from 'vitest';
import { buildAvailableModelGroups } from '@electron/ipc/agent/core/model-groups';
import { buildOnboardingAvailableModelGroups } from '@electron/features/onboarding/model-groups';

describe('buildOnboardingAvailableModelGroups', () => {
  it('matches the existing IPC model-group shaping output', () => {
    const available = [
      {
        provider: 'openai',
        api: 'openai-responses',
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        reasoning: true,
        thinkingLevelMap: { xhigh: 'xhigh', max: 'max' },
      },
      {
        provider: 'openai-codex',
        api: 'openai-codex-responses',
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        reasoning: false,
      },
      {
        provider: 'google',
        api: 'google-generative-ai',
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        reasoning: false,
      },
    ];

    expect(buildOnboardingAvailableModelGroups(available)).toEqual(buildAvailableModelGroups(available));
    expect(buildAvailableModelGroups(available)[0]?.models[0]).toMatchObject({
      availableThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
      supportsXhigh: true,
    });
  });

  it('omits disabled thinking levels from local model metadata', () => {
    const groups = buildAvailableModelGroups([{
      provider: 'sglang',
      api: 'openai-completions',
      id: 'Qwen/Qwen3-32B',
      name: 'Qwen3 32B',
      reasoning: true,
      thinkingLevelMap: {
        off: 'off',
        minimal: 'low',
        low: 'low',
        medium: 'medium',
        high: 'xhigh',
        xhigh: 'xhigh',
        max: null,
      },
    }]);

    expect(groups[0]?.models[0]?.availableThinkingLevels).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });
});
