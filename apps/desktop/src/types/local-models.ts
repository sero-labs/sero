/**
 * Types for managing local LLM providers (Ollama, LM Studio, vLLM, etc.)
 * via the Pi SDK's models.json configuration.
 *
 * Shared by Electron main process and renderer.
 */

import type {
  KnownApi,
  ModelCost,
  OpenAICompletionsCompat,
  ThinkingLevelMap,
} from '@earendil-works/pi-ai';

export type LocalProviderAuthentication = 'none' | 'api-key';
export type LocalProviderApiKeySource = 'literal' | 'environment' | 'command';
export type LocalThinkingFormat = NonNullable<OpenAICompletionsCompat['thinkingFormat']>;

/** Pi API types exposed by Sero's local-provider editor. */
type SupportedLocalModelApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai';

export type LocalModelApi = Extract<KnownApi, SupportedLocalModelApi>;

/** Pi's canonical per-million-token cost configuration. */
export type LocalModelCost = ModelCost;

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
  samplingParams?: Record<string, unknown>;
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
  samplingParams?: Record<string, unknown>;
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

/** Result of a models.json save and runtime refresh. */
export interface LocalModelsSaveResult {
  warning?: string;
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
export type LocalProviderPreset = 'ollama' | 'lm-studio' | 'vllm' | 'sglang' | 'custom';

/** Preset configuration for common local LLM servers. */
export interface LocalProviderPresetConfig {
  label: string;
  description: string;
  baseUrl: string;
  api: LocalModelApi;
  apiKey: string;
  compat?: LocalModelCompat;
}
