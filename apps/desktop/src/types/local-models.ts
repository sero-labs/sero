/**
 * Types for managing local LLM providers (Ollama, LM Studio, vLLM, etc.)
 * via the Pi SDK's models.json configuration.
 *
 * Shared by Electron main process and renderer.
 */

/** Supported API types for local model providers. */
export type LocalModelApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai';

/** Cost configuration per million tokens. */
export interface LocalModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** OpenAI compatibility overrides. */
export interface LocalModelCompat {
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  thinkingFormat?: 'reasoning_effort' | 'zai' | 'qwen' | 'qwen-chat-template';
  supportsStrictMode?: boolean;
  supportsStore?: boolean;
}

/** A single model entry within a local provider. */
export interface LocalModelEntry {
  id: string;
  name?: string;
  api?: LocalModelApi;
  reasoning?: boolean;
  input?: ('text' | 'image')[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: LocalModelCost;
  compat?: LocalModelCompat;
}

/** A local provider configuration. */
export interface LocalProviderConfig {
  baseUrl: string;
  api: LocalModelApi;
  apiKey: string;
  compat?: LocalModelCompat;
  models: LocalModelEntry[];
}

/** The full models.json structure. */
export interface LocalModelsConfig {
  providers: Record<string, LocalProviderConfig>;
}

/** Provider preset templates for quick setup. */
export type LocalProviderPreset = 'ollama' | 'lm-studio' | 'vllm' | 'custom';

/** Preset configuration for common local LLM servers. */
export interface LocalProviderPresetConfig {
  label: string;
  description: string;
  baseUrl: string;
  api: LocalModelApi;
  apiKey: string;
  compat?: LocalModelCompat;
}
