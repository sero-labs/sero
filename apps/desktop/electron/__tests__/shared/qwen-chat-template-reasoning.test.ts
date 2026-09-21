import { mkdir, rm, writeFile } from 'node:fs/promises';
import {
  createAssistantMessageEventStream,
  type Context,
  type Model,
  type ProviderStreams,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  removeQwenChatTemplateReasoning,
  syncQwenChatTemplateReasoning,
  withQwenChatTemplateReasoningEffort,
} from '@electron/shared/providers/qwen-chat-template-reasoning';

// A folder per run. A fixed path is shared with any other run on the machine,
// and the runtime can still be writing into it when `afterAll` removes it.
const { AGENT_DIR } = vi.hoisted(() => ({
  AGENT_DIR: `${require('node:os').tmpdir()}/sero-local-thinking-adapter-${process.pid}-${Date.now()}`,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: AGENT_DIR,
}));

const model: Model<'openai-completions'> = {
  id: 'Qwen/Qwen3-32B',
  name: 'Qwen3 32B',
  api: 'openai-completions',
  provider: 'sglang',
  baseUrl: 'http://localhost:30000/v1',
  reasoning: true,
  thinkingLevelMap: {
    low: 'low',
    medium: 'medium',
    xhigh: 'xhigh',
  },
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 8192,
  compat: {
    thinkingFormat: 'qwen-chat-template',
    supportsReasoningEffort: true,
  },
};
const context: Context = { messages: [] };

describe('Qwen chat-template reasoning effort', () => {
  beforeAll(async () => {
    await mkdir(AGENT_DIR, { recursive: true });
    await writeFile(`${AGENT_DIR}/auth.json`, '{}');
    await writeFile(`${AGENT_DIR}/models.json`, JSON.stringify({
      providers: {
        sglang: {
          baseUrl: 'http://localhost:30000/v1',
          api: 'openai-completions',
          apiKey: 'none',
          compat: {
            thinkingFormat: 'qwen-chat-template',
            supportsReasoningEffort: true,
          },
          models: [{ id: 'Qwen/Qwen3-32B', reasoning: true }],
        },
      },
    }));
  });

  afterAll(async () => {
    await rm(AGENT_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it.each([
    ['Off', undefined, undefined],
    ['Low', 'low', 'low'],
    ['Medium', 'medium', 'medium'],
    ['X-High', 'xhigh', 'xhigh'],
  ] as const)('adds the mapped reasoning effort for %s', (_label, reasoning, expected) => {
    let payload: Record<string, unknown> | null = null;
    const baseStream = vi.fn<ProviderStreams['streamSimple']>((_model, _context, options) => {
      payload = {
        chat_template_kwargs: { enable_thinking: Boolean(options?.reasoning) },
        ...options?.samplingParams,
      };
      return createAssistantMessageEventStream();
    });
    const stream = withQwenChatTemplateReasoningEffort(baseStream);
    const options: SimpleStreamOptions = reasoning ? { reasoning } : {};

    stream(model, context, options);

    expect(baseStream).toHaveBeenCalledWith(model, context, {
      ...options,
      samplingParams: { reasoning_effort: expected },
    });
    expect(payload).toEqual({
      chat_template_kwargs: { enable_thinking: Boolean(reasoning) },
      reasoning_effort: expected,
    });
  });

  it('does not alter other OpenAI-compatible thinking formats', () => {
    const baseStream = vi.fn<ProviderStreams['streamSimple']>(() => (
      createAssistantMessageEventStream()
    ));
    const stream = withQwenChatTemplateReasoningEffort(baseStream);
    const openAiModel: Model<'openai-completions'> = {
      ...model,
      compat: { thinkingFormat: 'openai' },
    };
    const options: SimpleStreamOptions = { reasoning: 'high' };

    stream(openAiModel, context, options);

    expect(baseStream).toHaveBeenCalledWith(openAiModel, context, options);
  });

  it('registers with the installed ModelRuntime provider contract', async () => {
    const runtime = await ModelRuntime.create({
      authPath: `${AGENT_DIR}/auth.json`,
      modelsPath: `${AGENT_DIR}/models.json`,
      allowModelNetwork: false,
    });

    const registerProvider = vi.spyOn(runtime, 'registerProvider');
    await expect(syncQwenChatTemplateReasoning(runtime)).resolves.toBeUndefined();
    await expect(syncQwenChatTemplateReasoning(runtime)).resolves.toBeUndefined();
    expect(runtime.getProvider('sglang')?.streamSimple).toBeTypeOf('function');
    expect(registerProvider).toHaveBeenCalledOnce();

    removeQwenChatTemplateReasoning(runtime);
  });
});
