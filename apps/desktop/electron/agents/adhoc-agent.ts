import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { Api, Model } from '@mariozechner/pi-ai';

import { SERO_AGENT_DIR } from '../env';
import { ensureInfra } from '../ipc/shared-infra';

const FAST_MODEL_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
  { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest' },
  { provider: 'openai', modelId: 'gpt-4.1-mini' },
  { provider: 'openai', modelId: 'gpt-4o-mini' },
  { provider: 'google', modelId: 'gemini-2.5-flash' },
  { provider: 'google', modelId: 'gemini-2.0-flash' },
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
  const selectedModel = selectFastModel(infra.modelRegistry.getAvailable(), infra.model);

  const { session } = await createAgentSession({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    model: selectedModel.model,
    thinkingLevel,
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    tools: [],
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
  fallback: Model<Api>,
): SelectedModel {
  for (const pref of FAST_MODEL_PREFERENCES) {
    const model = available.find((m) => m.provider === pref.provider && m.id === pref.modelId);
    if (model) {
      return { model, provider: pref.provider, modelId: pref.modelId };
    }
  }

  if (available[0]) {
    return {
      model: available[0],
      provider: available[0].provider,
      modelId: available[0].id,
    };
  }

  return {
    model: fallback,
    provider: fallback.provider,
    modelId: fallback.id,
  };
}

