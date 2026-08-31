import { describe, expect, it } from 'vitest';
import type { ChatModelExtensionContribution } from '@sero-ai/common';
import { matchesModelExtension } from './ModelExtensionActions';

const contribution: ChatModelExtensionContribution = {
  id: 'openai',
  extensionPoint: 'ui.chat.model-extension',
  component: 'OpenAIShortcut',
  models: [{ provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.6-luna' }],
};

describe('matchesModelExtension', () => {
  it('matches only the exact provider, API, and model', () => {
    expect(matchesModelExtension(contribution, { provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.6-luna', name: 'Luna', reasoning: true })).toBe(true);
    expect(matchesModelExtension(contribution, { provider: 'openai-codex', api: 'openai-responses', modelId: 'gpt-5.6-luna', name: 'Luna', reasoning: true })).toBe(false);
    expect(matchesModelExtension(contribution, { provider: 'openai', api: 'openai-codex-responses', modelId: 'gpt-5.6-luna', name: 'Luna', reasoning: true })).toBe(false);
    expect(matchesModelExtension(contribution, { provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.6-terra', name: 'Terra', reasoning: true })).toBe(false);
  });
});
