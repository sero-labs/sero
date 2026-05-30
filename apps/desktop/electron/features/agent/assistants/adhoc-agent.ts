import { createAgentSession, SettingsManager, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import { getModelTiers } from '@electron/shared/settings/model-tiers';

/** Provider-neutral fast model preferences, ordered by speed/cost. */
const FAST_MODEL_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: 'openai', modelId: 'gpt-5.4-mini' },
  { provider: 'google', modelId: 'gemini-3-flash-preview' },
  { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
  { provider: 'google', modelId: 'gemini-2.5-flash' },
];

interface SelectedModel {
  model: Model<Api>;
  provider: string;
  modelId: string;
}

export interface AdhocAgentResult {
  text: string;
  model: string;
}

const ADHOC_TIMEOUT_MS = 30_000;

export async function runAdhocAgent(
  workspacePath: string,
  prompt: string,
  thinkingLevel: ThinkingLevel = 'low',
): Promise<AdhocAgentResult> {
  const infra = await ensureInfra();
  const available = infra.modelRegistry.getAvailable();
  const selectedModel = selectFastModel(
    available,
    infra.settingsManager,
    infra.model,
  );

  const { session } = await createAgentSession({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    model: selectedModel.model,
    thinkingLevel,
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    noTools: 'all',
    sessionManager: SessionManager.inMemory(workspacePath),
    settingsManager: infra.settingsManager,
  });

  let text = '';
  const unsub = session.subscribe((event) => {
    if (event.type !== 'message_update') return;
    const ame = event.assistantMessageEvent;
    if (ame.type === 'text_delta') text += ame.delta;
  });

  try {
    await Promise.race([
      session.prompt(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Adhoc agent timed out')), ADHOC_TIMEOUT_MS),
      ),
    ]);
  } finally {
    unsub();
    session.dispose();
  }

  return {
    text: text.trim(),
    model: `${selectedModel.provider}/${selectedModel.modelId}`,
  };
}

function selectFastModel(
  available: Model<Api>[],
  settingsManager: ReturnType<typeof SettingsManager.create>,
  fallback: Model<Api> | null,
): SelectedModel {
  // 1. Try user's LOW tier model
  const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
  const tiers = getModelTiers(globalSettings);
  if (tiers.LOW) {
    const match = available.find(
      (m) => m.provider === tiers.LOW!.provider && m.id === tiers.LOW!.modelId,
    );
    if (match) {
      return { model: match, provider: match.provider, modelId: match.id };
    }
  }

  // 2. Walk provider-neutral preference list
  for (const pref of FAST_MODEL_PREFERENCES) {
    const model = available.find((m) => m.provider === pref.provider && m.id === pref.modelId);
    if (model) {
      return { model, provider: pref.provider, modelId: pref.modelId };
    }
  }

  // 3. First available model
  if (available[0]) {
    return {
      model: available[0],
      provider: available[0].provider,
      modelId: available[0].id,
    };
  }

  // 4. Absolute fallback (shared infra model, may be null)
  if (fallback) {
    return {
      model: fallback,
      provider: fallback.provider,
      modelId: fallback.id,
    };
  }

  throw new Error('No models available — please authenticate with a model provider.');
}
