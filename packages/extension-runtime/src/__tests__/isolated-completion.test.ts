import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { runIsolatedCompletion } from '../isolated-completion';

describe('runIsolatedCompletion', () => {
  it('dispatches through an extension-registered custom provider', async () => {
    const faux = fauxProvider({
      provider: 'alibaba-coding-plan-test',
      models: [{ id: 'custom-model', name: 'Custom Model' }],
    });
    faux.setResponses([fauxAssistantMessage('custom provider response')]);

    const authStorage = AuthStorage.inMemory();
    authStorage.setRuntimeApiKey('alibaba-coding-plan-test', 'test-key');
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    modelRegistry.registerProvider('alibaba-coding-plan-test', {
      baseUrl: 'http://localhost:0',
      apiKey: 'test-key',
      api: faux.api,
      streamSimple: faux.provider.streamSimple,
      models: faux.models.map((model) => ({
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        input: model.input,
        cost: model.cost,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        baseUrl: model.baseUrl,
      })),
    });
    const model = modelRegistry.find('alibaba-coding-plan-test', 'custom-model');
    expect(model).toBeDefined();

    const result = await runIsolatedCompletion({
      cwd: process.cwd(),
      model: model!,
      modelRegistry,
      prompt: 'Summarize this.',
      systemPrompt: 'Return text only.',
      thinkingLevel: 'low',
    });

    expect(result).toBe('custom provider response');
    expect(faux.getPendingResponseCount()).toBe(0);
  });
});
