import type { AgentSession } from '@earendil-works/pi-coding-agent';

import { getConfiguredModelFallbackChain } from '@electron/shared/settings/model-fallback-chain';
import { getModelTiers } from '@electron/shared/settings/model-tiers';
import { setRuntimeSessionModel } from './agent-helpers';

function findAvailableModelByProviderAndId(
  availableModels: ReturnType<AgentSession['modelRegistry']['getAvailable']>,
  provider: string | undefined,
  modelId: string | undefined,
) {
  if (!provider || !modelId) return undefined;
  return availableModels.find((model) => model.provider === provider && model.id === modelId);
}

function findAvailableModelByReference(
  availableModels: ReturnType<AgentSession['modelRegistry']['getAvailable']>,
  reference: string,
  preferredProvider?: string,
) {
  const trimmed = reference.trim();
  if (!trimmed) return undefined;

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex !== -1) {
    const provider = trimmed.slice(0, slashIndex).trim();
    const modelId = trimmed.slice(slashIndex + 1).trim();
    return findAvailableModelByProviderAndId(availableModels, provider, modelId);
  }

  const lowerId = trimmed.toLowerCase();
  const matches = availableModels.filter((model) => model.id.toLowerCase() === lowerId);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  if (preferredProvider) {
    const preferredMatch = matches.find((model) => model.provider === preferredProvider);
    if (preferredMatch) return preferredMatch;
  }

  return matches[0];
}

function pickFallbackModel(
  session: AgentSession,
  availableModels: ReturnType<AgentSession['modelRegistry']['getAvailable']>,
) {
  session.settingsManager.reload();

  const preferredProvider = session.settingsManager.getDefaultProvider();
  const savedDefaultModel = findAvailableModelByProviderAndId(
    availableModels,
    preferredProvider,
    session.settingsManager.getDefaultModel(),
  );
  if (savedDefaultModel) return savedDefaultModel;

  const globalSettings = session.settingsManager.getGlobalSettings() as Record<string, unknown>;
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const tierMatch = availableModels.find(
      (model) =>
        model.provider === tiers.HIGH!.provider &&
        model.id === tiers.HIGH!.modelId,
    );
    if (tierMatch) return tierMatch;
  }

  const fallbackChain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of fallbackChain) {
    const model = findAvailableModelByReference(availableModels, candidate, preferredProvider);
    if (model) return model;
  }

  return availableModels[0];
}

export function clearUnavailableSessionModel(session: AgentSession): boolean {
  if (!session.model) return false;

  // The SDK runtime accepts `undefined` here and `AgentSession.prompt()`
  // already treats that as “No model selected”. Keep this private-shape access
  // isolated behind the shared SDK adapter.
  setRuntimeSessionModel(session, undefined);
  return true;
}

export async function ensureSessionHasAvailableModel(
  session: AgentSession,
): Promise<boolean> {
  session.modelRegistry.authStorage.reload();

  const currentModel = session.model;
  const refreshedModel = currentModel
    ? session.modelRegistry.find(currentModel.provider, currentModel.id)
    : undefined;

  if (currentModel && refreshedModel && refreshedModel !== currentModel) {
    setRuntimeSessionModel(session, refreshedModel);
  }

  const availableModels = session.modelRegistry.getAvailable();
  const currentProvider = refreshedModel?.provider ?? currentModel?.provider;
  const currentModelId = refreshedModel?.id ?? currentModel?.id;
  const currentStillAvailable = !!findAvailableModelByProviderAndId(
    availableModels,
    currentProvider,
    currentModelId,
  );

  if (currentStillAvailable) return false;

  const fallbackModel = pickFallbackModel(session, availableModels);
  if (!fallbackModel) {
    return clearUnavailableSessionModel(session);
  }

  await session.setModel(fallbackModel);
  return true;
}
