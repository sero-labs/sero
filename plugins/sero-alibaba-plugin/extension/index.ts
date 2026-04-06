/**
 * Alibaba Cloud Extension — registers the Alibaba Cloud (DashScope) provider.
 *
 * Uses the OpenAI-compatible DashScope API (international endpoint).
 * Set DASHSCOPE_API_KEY in the environment, or add via Sero auth settings.
 *
 * Provider ID: alibaba-cloud
 * Models: Qwen coding + general models
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.registerProvider('alibaba-cloud', {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKey: 'DASHSCOPE_API_KEY',
    api: 'openai-completions',
    models: [
      // ── Qwen Coder (coding-optimised) ──────────────────────────────────
      {
        id: 'qwen-coder-plus-latest',
        name: 'Qwen Coder Plus',
        reasoning: false,
        input: ['text', 'image'],
        cost: { input: 3.5, output: 7.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      {
        id: 'qwen-coder-turbo-latest',
        name: 'Qwen Coder Turbo',
        reasoning: false,
        input: ['text', 'image'],
        cost: { input: 0.5, output: 2.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      // ── Qwen General (with reasoning) ─────────────────────────────────
      {
        id: 'qwen-max-latest',
        name: 'Qwen Max',
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 4.0, output: 12.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: true,
          reasoningEffortMap: {
            minimal: 'false',
            low: 'false',
            medium: 'true',
            high: 'true',
            xhigh: 'true',
          },
          maxTokensField: 'max_tokens',
          thinkingFormat: 'qwen',
        },
      },
      {
        id: 'qwen-plus-latest',
        name: 'Qwen Plus',
        reasoning: false,
        input: ['text', 'image'],
        cost: { input: 0.8, output: 2.4, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      {
        id: 'qwen-turbo-latest',
        name: 'Qwen Turbo',
        reasoning: false,
        input: ['text'],
        cost: { input: 0.05, output: 0.2, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      {
        id: 'qwen-long',
        name: 'Qwen Long',
        reasoning: false,
        input: ['text'],
        cost: { input: 0.05, output: 0.14, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 6000,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
    ],
  });
}
