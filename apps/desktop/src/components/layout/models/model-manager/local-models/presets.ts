/**
 * Preset configurations for common local LLM servers.
 */

import type { LocalProviderPreset, LocalProviderPresetConfig } from '@/types/local-models';

export const PROVIDER_PRESETS: Record<LocalProviderPreset, LocalProviderPresetConfig> = {
  ollama: {
    label: 'Ollama',
    description: 'Local LLM server with model management',
    baseUrl: 'http://localhost:11434/v1',
    api: 'openai-completions',
    apiKey: 'none',
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  },
  'lm-studio': {
    label: 'LM Studio',
    description: 'Local model server with GUI',
    baseUrl: 'http://localhost:1234/v1',
    api: 'openai-completions',
    apiKey: 'none',
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  },
  vllm: {
    label: 'vLLM',
    description: 'High-throughput inference server',
    baseUrl: 'http://localhost:8000/v1',
    api: 'openai-completions',
    apiKey: 'none',
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  },
  sglang: {
    label: 'SGLang',
    description: 'High-throughput server for Qwen and other models',
    baseUrl: 'http://localhost:30000/v1',
    api: 'openai-completions',
    apiKey: 'none',
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      thinkingFormat: 'qwen-chat-template',
    },
  },
  custom: {
    label: 'Custom',
    description: 'Any OpenAI-compatible server',
    baseUrl: 'http://localhost:8080/v1',
    api: 'openai-completions',
    apiKey: 'none',
  },
};

export const PRESET_ORDER: LocalProviderPreset[] = [
  'ollama',
  'lm-studio',
  'vllm',
  'sglang',
  'custom',
];
