import {
  type Api,
  type Model,
  type ModelsRefreshOptions,
} from '@earendil-works/pi-ai';

import {
  ensureInfra,
  refreshInfraModelSelection,
  applyRuntimeSettings,
} from '@electron/shared/infra/shared-infra';
import { cleanupUnavailableModelSelections } from '@electron/shared/settings/cleanup-unavailable-model-selections';
import { syncQwenChatTemplateReasoning } from '@electron/shared/providers/qwen-chat-template-reasoning';
import { buildModelState } from './agent-helpers';
import { ensureSessionHasAvailableModel } from './agent-session-model-sync';
import { syncAppSessionPoolModels } from './app-agent-session-model-sync';
import { emitAgentEvent, getAgentPoolEntries } from './agent';
import { getAppAgentSessions } from '../handlers/app-agent';

export interface ModelAvailabilityRefreshResult {
  sharedModel: Model<Api> | null;
  updatedChatSessions: number;
  updatedAppSessions: number;
  refreshWarnings: string[];
  registryError?: string;
}

function buildAvailableModelSelections(
  models: readonly Model<Api>[],
) {
  return models.map((model) => ({
    provider: model.provider,
    modelId: model.id,
  }));
}

async function reconcileLiveChatSessions(): Promise<number> {
  const entries = getAgentPoolEntries();

  const results = await Promise.all(entries.map(async ([sessionId, entry]) => {
    try {
      const updated = await ensureSessionHasAvailableModel(entry.session);
      emitAgentEvent({
        type: 'model_change',
        sessionId,
        state: buildModelState(entry),
      });
      return updated ? 1 : 0;
    } catch (error) {
      console.warn(`[model-refresh] Failed to reconcile chat session ${sessionId}:`, error);
      return 0;
    }
  }));

  return results.reduce<number>((total, count) => total + count, 0);
}

export async function refreshModelAvailability(
  refreshOptions?: ModelsRefreshOptions,
): Promise<ModelAvailabilityRefreshResult> {
  const infra = await ensureInfra();

  const refreshResult = await infra.modelRuntime.refresh(refreshOptions);
  await syncQwenChatTemplateReasoning(infra.modelRuntime);
  const refreshWarnings: string[] = [];
  if (refreshResult.aborted) refreshWarnings.push('Model refresh was cancelled');
  if (refreshResult.errors.size > 0) {
    const details = [...refreshResult.errors]
      .map(([provider, error]) => `${provider}: ${error.message}`)
      .join('; ');
    refreshWarnings.push(`Provider model refresh failed: ${details}`);
  }

  const loadError = infra.modelRegistry.getError();
  if (loadError) refreshWarnings.push(loadError);
  for (const warning of refreshWarnings) console.warn(`[model-refresh] ${warning}`);

  const availableModels = infra.modelRegistry.getAvailable();
  const cleanedSettings = cleanupUnavailableModelSelections(
    buildAvailableModelSelections(availableModels),
  );

  if (cleanedSettings) {
    infra.settingsManager.reload();
  }
  applyRuntimeSettings(infra.settingsManager);

  const sharedModel = refreshInfraModelSelection();
  const [updatedChatSessions, updatedAppSessions] = await Promise.all([
    reconcileLiveChatSessions(),
    syncAppSessionPoolModels(getAppAgentSessions(), sharedModel).catch((error) => {
      console.warn('[model-refresh] Failed to reconcile app-agent sessions:', error);
      return 0;
    }),
  ]);

  return {
    sharedModel,
    updatedChatSessions,
    updatedAppSessions,
    refreshWarnings,
    registryError: loadError ?? undefined,
  };
}
