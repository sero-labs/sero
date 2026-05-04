/**
 * Types for managing local LLM providers (Ollama, LM Studio, vLLM, etc.)
 * via the Pi SDK's models.json configuration.
 *
 * Shared by Electron main process and renderer.
 */

import type { OpenAICompletionsCompat, ThinkingLevelMap } from '@mariozechner/pi-ai';

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

/** OpenAI compatibility overrides supported by models.json. */
export type LocalModelCompat = OpenAICompletionsCompat;

/** A single model entry within a local provider. */
export interface LocalModelEntry {
  id: string;
  name?: string;
  api?: LocalModelApi;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input?: ('text' | 'image')[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: LocalModelCost;
  headers?: Record<string, string>;
  compat?: LocalModelCompat;
}

/** Per-model override for built-in provider models. */
export interface LocalModelOverride {
  name?: string;
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input?: ('text' | 'image')[];
  cost?: Partial<LocalModelCost>;
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  compat?: LocalModelCompat;
}

/** A local provider configuration. Mirrors Pi's models.json schema. */
export interface LocalProviderConfig {
  baseUrl?: string;
  api?: LocalModelApi;
  apiKey?: string;
  headers?: Record<string, string>;
  compat?: LocalModelCompat;
  authHeader?: boolean;
  models?: LocalModelEntry[];
  modelOverrides?: Record<string, LocalModelOverride>;
}

/** The full models.json structure. */
export interface LocalModelsConfig {
  providers: Record<string, LocalProviderConfig>;
}

/** Connection parameters used by the UI for test/discovery calls. */
export interface LocalModelsConnectionRequest {
  baseUrl: string;
  api: LocalModelApi;
  apiKey?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
}

/** Model info returned by remote discovery helpers. */
export interface LocalRemoteModelInfo {
  id: string;
  name?: string;
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
