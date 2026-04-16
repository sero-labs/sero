import { describe, expect, it } from 'vitest';
import { buildAvailableModelGroups } from '@electron/ipc/agent/core/model-groups';
import { buildOnboardingAvailableModelGroups } from '@electron/features/onboarding/model-groups';

describe('buildOnboardingAvailableModelGroups', () => {
  it('matches the existing IPC model-group shaping output', () => {
    const available = [
      {
        provider: 'openai',
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        reasoning: true,
      },
      {
        provider: 'openai-codex',
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        reasoning: false,
      },
      {
        provider: 'google',
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        reasoning: false,
      },
    ];

    expect(buildOnboardingAvailableModelGroups(available)).toEqual(buildAvailableModelGroups(available));
  });
});
