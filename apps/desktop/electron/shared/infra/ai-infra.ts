import {
  ModelRegistry,
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { registerPackageProviderAuth } from '@electron/shared/providers/package-provider-manifests';
import { syncQwenChatTemplateReasoning } from '@electron/shared/providers/qwen-chat-template-reasoning';
import { pickFirstAvailableModel } from './model-selection';

let infra: SharedInfra | null = null;
let initialization: Promise<SharedInfra> | null = null;

export interface SharedInfra {
  modelRuntime: ModelRuntime;
  modelRegistry: ModelRegistry;
  settingsManager: ReturnType<typeof SettingsManager.create>;
  model: Model<Api> | null;
}

/** Initialize only the AI SDK state, without starting application services. */
export async function ensureAiInfra(): Promise<SharedInfra> {
  if (infra) return infra;
  if (initialization) return initialization;

  initialization = (async () => {
    const modelRuntime = await ModelRuntime.create({
      authPath: `${SERO_AGENT_DIR}/auth.json`,
      modelsPath: `${SERO_AGENT_DIR}/models.json`,
      allowModelNetwork: false,
    });
    registerPackageProviderAuth(modelRuntime);
  await syncQwenChatTemplateReasoning(modelRuntime);
    const modelRegistry = new ModelRegistry(modelRuntime);
    const settingsManager = SettingsManager.create(SERO_AGENT_DIR, SERO_AGENT_DIR);
    if (!settingsManager.getDefaultThinkingLevel()) {
      settingsManager.setDefaultThinkingLevel('high');
    }
    infra = {
      modelRuntime,
      modelRegistry,
      settingsManager,
      model: pickFirstAvailableModel(modelRegistry, settingsManager),
    };
    return infra;
  })();

  try {
    return await initialization;
  } catch (error) {
    initialization = null;
    throw error;
  }
}

export function refreshInfraModelSelection(): Model<Api> | null {
  if (!infra) return null;
  infra.model = pickFirstAvailableModel(infra.modelRegistry, infra.settingsManager);
  return infra.model;
}
