import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { AuthStorage, DefaultResourceLoader, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { runIsolatedCompletion } from '../isolated-completion';

function createTestRuntime() {
  const faux = fauxProvider({
    provider: 'alibaba-coding-plan-test',
    models: [{ id: 'custom-model', name: 'Custom Model' }],
  });

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
  if (!model) throw new Error('Expected faux model to be registered.');

  return { faux, model, modelRegistry };
}

describe('runIsolatedCompletion', () => {
  it('dispatches through an extension-registered custom provider', async () => {
    const { faux, model, modelRegistry } = createTestRuntime();
    faux.setResponses([fauxAssistantMessage('custom provider response')]);

    const result = await runIsolatedCompletion({
      cwd: process.cwd(),
      model,
      modelRegistry,
      prompt: 'Summarize this.',
      systemPrompt: 'Return text only.',
      thinkingLevel: 'low',
    });

    expect(result).toBe('custom provider response');
    expect(faux.getPendingResponseCount()).toBe(0);
  });

  it('does not load project APPEND_SYSTEM.md instructions', async () => {
    const { faux, model, modelRegistry } = createTestRuntime();
    const cwd = await mkdtemp(path.join(tmpdir(), 'sero-isolated-completion-'));
    const contamination = 'This instruction must not reach the isolated completion.';
    let systemPrompt = '';

    try {
      await mkdir(path.join(cwd, '.pi'));
      await writeFile(path.join(cwd, '.pi', 'APPEND_SYSTEM.md'), contamination);
      faux.setResponses([
        (context) => {
          systemPrompt = context.systemPrompt ?? '';
          return fauxAssistantMessage('isolated response');
        },
      ]);

      await runIsolatedCompletion({
        cwd,
        model,
        modelRegistry,
        prompt: 'Summarize this.',
        systemPrompt: 'Return text only.',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }

    expect(systemPrompt).toContain('Return text only.');
    expect(systemPrompt).not.toContain(contamination);
  });

  it('stops before prompting when aborted during setup', async () => {
    const { faux, model, modelRegistry } = createTestRuntime();
    const controller = new AbortController();
    const reload = vi.spyOn(DefaultResourceLoader.prototype, 'reload').mockImplementationOnce(async () => {
      controller.abort();
    });

    try {
      await expect(runIsolatedCompletion({
        cwd: process.cwd(),
        model,
        modelRegistry,
        prompt: 'Summarize this.',
        signal: controller.signal,
      })).rejects.toThrow('Aborted');
    } finally {
      reload.mockRestore();
    }

    expect(faux.state.callCount).toBe(0);
  });
});
