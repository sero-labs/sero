import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { pickFirstAvailableModel } from './model-selection';

let authStorage: AuthStorage | null = null;
let modelRegistry: ModelRegistry | null = null;
let settingsManager: ReturnType<typeof SettingsManager.create> | null = null;
let model: Model<Api> | null = null;

export interface SharedInfra {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: ReturnType<typeof SettingsManager.create>;
  model: Model<Api> | null;
}

/** Initialize only the AI SDK state, without starting application services. */
export function ensureAiInfra(): SharedInfra {
  if (!authStorage) {
    authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
    modelRegistry = ModelRegistry.create(authStorage, `${SERO_AGENT_DIR}/models.json`);
    settingsManager = SettingsManager.create(SERO_AGENT_DIR, SERO_AGENT_DIR);
    if (!settingsManager.getDefaultThinkingLevel()) {
      settingsManager.setDefaultThinkingLevel('high');
    }
    model = pickFirstAvailableModel(modelRegistry, settingsManager);
  }

  return {
    authStorage,
    modelRegistry: modelRegistry!,
    settingsManager: settingsManager!,
    model,
  };
}

export function refreshInfraModelSelection(): Model<Api> | null {
  if (!modelRegistry || !settingsManager) return model;
  model = pickFirstAvailableModel(modelRegistry, settingsManager);
  return model;
}
