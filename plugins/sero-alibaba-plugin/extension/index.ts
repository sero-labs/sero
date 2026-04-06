/**
 * Alibaba Cloud Extension — registers the Alibaba Cloud (DashScope) provider.
 *
 * Uses the OpenAI-compatible DashScope API (international endpoint).
 * Set DASHSCOPE_API_KEY in the environment, or add via Sero auth settings.
 *
 * Provider ID: alibaba-cloud
 * Models: Qwen3 (current generation) + Qwen2.5 (legacy, broad API access)
 *
 * Coding Plan models: qwen3.5-plus, qwen3-max-2026-01-23,
 *                     qwen3-coder-next, qwen3-coder-plus
 * Full API key:       all models below
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.registerProvider('alibaba-cloud', {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKey: 'DASHSCOPE_API_KEY',
    api: 'openai-completions',
    models: [
      // ── Qwen3 Coder (Coding Plan + API key) ───────────────────────────
      {
        // Next-gen flagship coder — not yet GA, may require allowlist
        id: 'qwen3-coder-next',
        name: 'Qwen3 Coder Next',
        reasoning: false,
        input: ['text'],
        cost: { input: 3.5, output: 7.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 16384,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        reasoning: false,
        input: ['text'],
        cost: { input: 3.5, output: 7.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 16384,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      // ── Qwen3.5 (Coding Plan + API key) ───────────────────────────────
      {
        // Vision + Deep Thinking, 1M context
        id: 'qwen3.5-plus',
        name: 'Qwen3.5 Plus',
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 1.5, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 65536,
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
      // ── Qwen3 General (Coding Plan + API key) ─────────────────────────
      {
        // Deep Thinking, 262K context
        id: 'qwen3-max-2026-01-23',
        name: 'Qwen3 Max',
        reasoning: true,
        input: ['text'],
        cost: { input: 1.2, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 16384,
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
        // Balanced: thinking optional, 128K context
        id: 'qwen3-plus',
        name: 'Qwen3 Plus',
        reasoning: true,
        input: ['text'],
        cost: { input: 0.4, output: 1.2, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 16384,
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
        // Fast + cheap, 1M context
        id: 'qwen3-turbo',
        name: 'Qwen3 Turbo',
        reasoning: false,
        input: ['text'],
        cost: { input: 0.05, output: 0.2, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      // ── Qwen2.5 legacy (full API key only) ────────────────────────────
      {
        id: 'qwen-coder-plus-latest',
        name: 'Qwen2.5 Coder Plus',
        reasoning: false,
        input: ['text'],
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
        name: 'Qwen2.5 Coder Turbo',
        reasoning: false,
        input: ['text'],
        cost: { input: 0.5, output: 2.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
      {
        id: 'qwen-max-latest',
        name: 'Qwen2.5 Max',
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
        name: 'Qwen2.5 Plus',
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
        id: 'qwen-long',
        name: 'Qwen2.5 Long',
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
