import { type Model, type Api } from '@mariozechner/pi-ai';

import {
  ensureInfra,
  refreshInfraModelSelection,
  applyRuntimeSettings,
} from '@electron/shared/infra/shared-infra';
import { cleanupUnavailableModelSelections } from '@electron/shared/settings/cleanup-unavailable-model-selections';
import { buildModelState } from './agent-helpers';
import { ensureSessionHasAvailableModel } from './agent-session-model-sync';
import { syncAppSessionPoolModels } from './app-agent-session-model-sync';
import { emitAgentEvent, getAgentPoolEntries } from './agent';
import { getAppAgentSessions } from '../handlers/app-agent';

export interface ModelAvailabilityRefreshResult {
  sharedModel: Model<Api> | null;
  updatedChatSessions: number;
  updatedAppSessions: number;
}

function buildAvailableModelSelections(
  models: ReturnType<Awaited<ReturnType<typeof ensureInfra>>['modelRegistry']['getAvailable']>,
) {
  return models.map((model) => ({
    provider: model.provider,
    modelId: model.id,
  }));
}

async function reconcileLiveChatSessions(): Promise<number> {
  const entries = getAgentPoolEntries();
  let updated = 0;

  for (const [sessionId, entry] of entries) {
    try {
      if (await ensureSessionHasAvailableModel(entry.session)) {
        updated += 1;
      }
      emitAgentEvent({
        type: 'model_change',
        sessionId,
        state: buildModelState(entry),
      });
    } catch (error) {
      console.warn(`[model-refresh] Failed to reconcile chat session ${sessionId}:`, error);
    }
  }

  return updated;
}

export async function refreshModelAvailability(): Promise<ModelAvailabilityRefreshResult> {
  const infra = await ensureInfra();

  infra.modelRegistry.refresh();

  const loadError = infra.modelRegistry.getError();
  if (loadError) {
    throw new Error(loadError);
  }

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
  };
}
