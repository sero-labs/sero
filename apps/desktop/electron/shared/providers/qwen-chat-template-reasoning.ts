import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Api,
  Context,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { LocalModelsConfig, LocalProviderConfig } from '@/types/local-models';
import { SERO_AGENT_DIR } from '@electron/platform/env';

const MODELS_JSON_PATH = path.join(SERO_AGENT_DIR, 'models.json');
const registeredProviders = new WeakMap<ModelRuntime, Set<string>>();

// Pi handles thinkingLevelMap for its native request formats. Pi 0.84.2's
// qwen-chat-template branch is the exception: it sends the chat-template
// switch but not the mapped top-level reasoning_effort required by SGLang.

function usesQwenChatTemplate(provider: LocalProviderConfig): boolean {
  if (!provider.models?.length) return false;
  if (provider.compat?.thinkingFormat === 'qwen-chat-template') return true;
  return provider.models.some(
    (model) => model.compat?.thinkingFormat === 'qwen-chat-template',
  );
}

function isQwenChatTemplateModel(
  model: Model<Api>,
): model is Model<'openai-completions'> {
  return model.api === 'openai-completions'
    && model.compat !== undefined
    && 'thinkingFormat' in model.compat
    && model.compat.thinkingFormat === 'qwen-chat-template'
    && model.compat.supportsReasoningEffort === true;
}

export function withQwenChatTemplateReasoningEffort(
  baseStreamSimple: ProviderStreams['streamSimple'],
): ProviderStreams['streamSimple'] {
  return (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => {
    if (!isQwenChatTemplateModel(model)) {
      return baseStreamSimple(model, context, options);
    }

    const mappedEffort = options?.reasoning
      ? model.thinkingLevelMap?.[options.reasoning] ?? options.reasoning
      : undefined;
    const samplingParams = { ...(options?.samplingParams ?? {}) };
    if (typeof mappedEffort === 'string') {
      samplingParams.reasoning_effort = mappedEffort;
    } else {
      samplingParams.reasoning_effort = undefined;
    }

    return baseStreamSimple(model, context, {
      ...options,
      samplingParams,
    });
  };
}

async function readLocalModelsConfig(): Promise<LocalModelsConfig> {
  const raw = await readFile(MODELS_JSON_PATH, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '{"providers":{}}';
    throw error;
  });
  try {
    return JSON.parse(raw) as LocalModelsConfig;
  } catch {
    return { providers: {} };
  }
}

export async function syncQwenChatTemplateReasoning(
  modelRuntime: ModelRuntime,
): Promise<void> {
  const registeredProviderIds = registeredProviders.get(modelRuntime) ?? new Set<string>();
  registeredProviders.set(modelRuntime, registeredProviderIds);
  const config = await readLocalModelsConfig();
  const nextProviderIds = new Set(
    Object.entries(config.providers ?? {})
      .filter(([, provider]) => usesQwenChatTemplate(provider))
      .map(([providerId]) => providerId),
  );

  for (const providerId of nextProviderIds) {
    if (registeredProviderIds.has(providerId)) continue;
    const baseStreamSimple = modelRuntime.getProvider(providerId)?.streamSimple;
    if (!baseStreamSimple) continue;
    modelRuntime.registerProvider(providerId, {
      api: 'openai-completions',
      streamSimple: withQwenChatTemplateReasoningEffort(baseStreamSimple),
    });
    registeredProviderIds.add(providerId);
  }
  for (const providerId of registeredProviderIds) {
    if (nextProviderIds.has(providerId)) continue;
    modelRuntime.unregisterProvider(providerId);
    registeredProviderIds.delete(providerId);
  }
}

export function removeQwenChatTemplateReasoning(modelRuntime: ModelRuntime): void {
  const registeredProviderIds = registeredProviders.get(modelRuntime);
  if (!registeredProviderIds) return;
  for (const providerId of registeredProviderIds) {
    modelRuntime.unregisterProvider(providerId);
  }
  registeredProviders.delete(modelRuntime);
}
