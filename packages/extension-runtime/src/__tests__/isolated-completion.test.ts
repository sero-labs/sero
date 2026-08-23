import {
  fauxAssistantMessage,
  fauxProvider,
} from '@earendil-works/pi-ai/providers/faux';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import {
  AgentSession,
  createEventBus,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createIsolatedCompletionService,
  registerIsolatedCompletionHost,
  requestIsolatedCompletion,
} from '../isolated-completion';

async function createTestRuntime() {
  const faux = fauxProvider({
    provider: 'alibaba-coding-plan-test',
    models: [{ id: 'custom-model', name: 'Custom Model', reasoning: true }],
  });
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  modelRegistry.registerProvider(faux.provider);
  await modelRuntime.setRuntimeApiKey('alibaba-coding-plan-test', 'test-key');
  const model = modelRuntime.getModel('alibaba-coding-plan-test', 'custom-model');
  if (!model) throw new Error('Expected faux model to be registered.');
  const agentDir = await mkdtemp(path.join(tmpdir(), 'sero-isolated-agent-'));
  const service = createIsolatedCompletionService({ agentDir, modelRuntime });
  return { agentDir, faux, model, modelRuntime, service };
}

describe('isolated completion service', () => {
  it('dispatches an extension-registered provider through the host boundary', async () => {
    const { agentDir, faux, model, service } = await createTestRuntime();
    const events = createEventBus();
    const unregister = registerIsolatedCompletionHost(events, service);
    faux.setResponses([fauxAssistantMessage('custom provider response')]);

    try {
      const result = await requestIsolatedCompletion(events, {
        cwd: process.cwd(),
        model,
        prompt: 'Summarize this.',
        systemPrompt: 'Return text only.',
        thinkingLevel: 'low',
      });

      expect(result).toBe('custom provider response');
      expect(faux.getPendingResponseCount()).toBe(0);
    } finally {
      unregister();
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it('isolates instructions, tools, extensions, thinking, and persistence', async () => {
    const { agentDir, faux, model, service } = await createTestRuntime();
    const cwd = await mkdtemp(path.join(tmpdir(), 'sero-isolated-project-'));
    const contamination = 'This instruction must not reach the isolated completion.';
    let observedSystemPrompt = '';
    let observedTools: unknown;
    let observedReasoning: unknown;
    const dispose = vi.spyOn(AgentSession.prototype, 'dispose');

    try {
      await mkdir(path.join(cwd, '.pi'));
      await writeFile(path.join(cwd, '.pi', 'APPEND_SYSTEM.md'), contamination);
      faux.setResponses([
        (context, options) => {
          observedSystemPrompt = context.systemPrompt ?? '';
          observedTools = context.tools;
          observedReasoning = (options as { reasoning?: unknown } | undefined)?.reasoning;
          return fauxAssistantMessage('isolated response');
        },
      ]);

      await expect(service({
        cwd,
        model,
        prompt: 'Summarize this.',
        systemPrompt: 'Return text only.',
        thinkingLevel: 'low',
      })).resolves.toBe('isolated response');

      expect(observedSystemPrompt).toContain('Return text only.');
      expect(observedSystemPrompt).not.toContain(contamination);
      expect(observedTools).toEqual([]);
      expect(observedReasoning).toBe('low');
      expect(dispose).toHaveBeenCalledOnce();
      expect(await readdir(agentDir)).not.toContain('sessions');
    } finally {
      dispose.mockRestore();
      await Promise.all([
        rm(cwd, { recursive: true, force: true }),
        rm(agentDir, { recursive: true, force: true }),
      ]);
    }
  });

  it('stops before prompting when aborted during setup', async () => {
    const { agentDir, faux, model, service } = await createTestRuntime();
    const controller = new AbortController();
    const reload = vi.spyOn(DefaultResourceLoader.prototype, 'reload')
      .mockImplementationOnce(async () => {
        controller.abort();
      });

    try {
      await expect(service({
        cwd: process.cwd(),
        model,
        prompt: 'Summarize this.',
        signal: controller.signal,
      })).rejects.toThrow('Aborted');
      expect(faux.state.callCount).toBe(0);
    } finally {
      reload.mockRestore();
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it('aborts an active request and disposes its session', async () => {
    const { agentDir, faux, model, service } = await createTestRuntime();
    const controller = new AbortController();
    const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
    faux.setResponses([
      async (_context, options) => {
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        return fauxAssistantMessage('late response', { stopReason: 'aborted' });
      },
    ]);

    try {
      const completion = service({
        cwd: process.cwd(),
        model,
        prompt: 'Summarize this.',
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(faux.state.callCount).toBe(1));
      controller.abort();

      await expect(completion).rejects.toThrow('Aborted');
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      dispose.mockRestore();
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it('disposes its session when prompting fails', async () => {
    const { agentDir, model, service } = await createTestRuntime();
    const prompt = vi.spyOn(AgentSession.prototype, 'prompt')
      .mockRejectedValueOnce(new Error('provider failed'));
    const dispose = vi.spyOn(AgentSession.prototype, 'dispose');

    try {
      await expect(service({
        cwd: process.cwd(),
        model,
        prompt: 'Summarize this.',
      })).rejects.toThrow('provider failed');
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      prompt.mockRestore();
      dispose.mockRestore();
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it('rejects plugin requests when no host service is registered', async () => {
    const { agentDir, model } = await createTestRuntime();
    try {
      await expect(requestIsolatedCompletion(createEventBus(), {
        cwd: process.cwd(),
        model,
        prompt: 'Summarize this.',
      })).rejects.toThrow('Isolated completion service is unavailable');
    } finally {
      await rm(agentDir, { recursive: true, force: true });
    }
  });
});
