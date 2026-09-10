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

/** Bound for one queued refresh, including its network phase. */
const MODEL_REFRESH_TIMEOUT_MS = 15_000;

/**
 * True when the user asked Sero to avoid model network access.
 *
 * Pi's `ModelRuntime.create()` disables model network access whenever
 * `PI_OFFLINE` is set at all — it tests `process.env.PI_OFFLINE === undefined`
 * — while Pi's CLI help text documents `PI_OFFLINE` as a truthy flag. Sero
 * follows `ModelRuntime` so a refresh agrees with the behaviour `create()`
 * already applied and both refresh callers agree with each other.
 */
export function isModelNetworkDisabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.PI_OFFLINE !== undefined;
}

/**
 * Resolve refresh options against the offline intent.
 *
 * An offline refresh stays useful: Pi restores the persisted catalog overlay
 * during its local phase, before it checks the network flag, so the cached
 * catalog still applies and no request leaves the machine.
 */
function resolveModelRefreshOptions(
  options: ModelsRefreshOptions = {},
  offline: boolean = isModelNetworkDisabled(),
): ModelsRefreshOptions {
  return offline ? { ...options, allowNetwork: false, force: false } : options;
}

let refreshQueue: Promise<unknown> = Promise.resolve();

/**
 * Serialize model refreshes so the startup refresh, the interval, and a
 * credential change never run the post-refresh reconciliation together.
 * Pi guards its own provider generations, but Sero's settings cleanup, session
 * reconciliation, and app-session sync would otherwise run more than once.
 */
export function queueModelAvailabilityRefresh(
  options: ModelsRefreshOptions = {},
): Promise<ModelAvailabilityRefreshResult> {
  const run = refreshQueue.then(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_REFRESH_TIMEOUT_MS);
    try {
      return await refreshModelAvailability({
        ...resolveModelRefreshOptions(options),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  });
  // Keep the chain usable after a rejected refresh.
  refreshQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
