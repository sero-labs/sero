/**
 * Alibaba Coding Plan Extension — registers Coding Plan models.
 *
 * Uses Alibaba Coding Plan's OpenAI-compatible endpoint.
 * Authenticate by either:
 *   1. Saving an API key in Sero auth settings for provider `alibaba-coding-plan`, or
 *   2. Setting ALIBABA_CODING_PLAN_KEY in the environment.
 *
 * Provider ID: alibaba-coding-plan
 *
 * Coding Plan models:
 *   Qwen:    qwen3.5-plus, qwen3-max-2026-01-23, qwen3-coder-next, qwen3-coder-plus
 *   Zhipu:   glm-5, glm-4.7
 *   Kimi:    kimi-k2.5
 *   MiniMax: MiniMax-M2.5
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const THINKING_LEVEL_MAP = {
  minimal: 'false',
  low: 'false',
  medium: 'true',
  high: 'true',
  xhigh: 'true',
} as const;

function textCompat() {
  return {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    maxTokensField: 'max_tokens' as const,
  };
}

function reasoningCompat() {
  return {
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    maxTokensField: 'max_tokens' as const,
    thinkingFormat: 'qwen' as const,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerProvider('alibaba-coding-plan', {
    name: 'Alibaba Coding Plan',
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
    // Shell-resolved env lookup keeps the provider hidden until the user has
    // either saved a key in auth.json or actually exported ALIBABA_CODING_PLAN_KEY.
    apiKey: '!printenv ALIBABA_CODING_PLAN_KEY',
    api: 'openai-completions',
    models: [
      {
        id: 'qwen3.6-plus',
        name: 'Qwen3.6 Plus',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text', 'image'],
        cost: { input: 0.5, output: 3.0, cacheRead: 0.05, cacheWrite: 0.625 },
        contextWindow: 1000000,
        maxTokens: 65536,
        compat: reasoningCompat(),
      },
      {
        id: 'qwen3.5-plus',
        name: 'Qwen3.5 Plus',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text', 'image'],
        cost: { input: 1.5, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 65536,
        compat: reasoningCompat(),
      },
      {
        id: 'qwen3-max-2026-01-23',
        name: 'Qwen3 Max',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text'],
        cost: { input: 1.2, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 16384,
        compat: reasoningCompat(),
      },
      {
        id: 'qwen3-coder-next',
        name: 'Qwen3 Coder Next',
        reasoning: false,
        input: ['text'],
        cost: { input: 3.5, output: 7.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 16384,
        compat: textCompat(),
      },
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        reasoning: false,
        input: ['text'],
        cost: { input: 3.5, output: 7.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 16384,
        compat: textCompat(),
      },
      {
        id: 'glm-5',
        name: 'GLM-5',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text'],
        cost: { input: 1.4, output: 4.4, cacheRead: 0, cacheWrite: 0.26 },
        contextWindow: 202000,
        maxTokens: 128000,
        compat: reasoningCompat(),
      },
      {
        id: 'glm-4.7',
        name: 'GLM-4.7',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text'],
        cost: { input: 1.0, output: 3.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 16384,
        compat: reasoningCompat(),
      },
      {
        id: 'kimi-k2.5',
        name: 'Kimi K2.5',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text', 'image'],
        cost: { input: 2.0, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384,
        compat: reasoningCompat(),
      },
      {
        id: 'MiniMax-M2.5',
        name: 'MiniMax M2.5',
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ['text'],
        cost: { input: 2.0, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384,
        compat: reasoningCompat(),
      },
    ],
  });
}
