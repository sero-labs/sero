import { ipcMain } from 'electron';
import type { AgentSession, DefaultResourceLoader } from '@mariozechner/pi-coding-agent';

import { IpcChannels } from '../../../../src/types/ipc';
import type {
  AgentStreamEvent,
  ContextOverrides,
  ContextSkillInfo,
  ContextToolInfo,
  SessionContext,
  SessionModelState,
} from '../../../../src/types/ipc';
import {
  buildModelState,
  validateProvider,
  validateThinkingLevel,
} from './agent-helpers';
import {
  applyContextOverrides,
  areContextOverridesEqual,
  persistContextOverrides,
} from './agent-context-overrides';
import { getConfiguredModelFallbackChain } from '../../../shared/settings/model-fallback-chain';
import { getModelTiers } from '../../../shared/settings/model-tiers';
import { cleanupUnavailableModelSelections } from '../../../shared/settings/cleanup-unavailable-model-selections';

export interface AgentPoolContextEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
  contextOverrides: ContextOverrides | null;
  baseSystemPrompt: string;
  baseTools: ContextToolInfo[];
}

interface RegisterModelContextHandlersOptions {
  getEntry: (sessionId: string) => AgentPoolContextEntry | undefined;
  sendEvent: (event: AgentStreamEvent) => void;
}

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

  // 1. Try saved default provider/model (existing settings)
  const preferredProvider = session.settingsManager.getDefaultProvider();
  const savedDefaultModel = findAvailableModelByProviderAndId(
    availableModels,
    preferredProvider,
    session.settingsManager.getDefaultModel(),
  );
  if (savedDefaultModel) return savedDefaultModel;

  // 2. Try HIGH tier model (main sessions use the most capable model)
  const globalSettings = session.settingsManager.getGlobalSettings() as Record<string, unknown>;
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const tierMatch = availableModels.find(
      (m) => m.provider === tiers.HIGH!.provider && m.id === tiers.HIGH!.modelId,
    );
    if (tierMatch) return tierMatch;
  }

  // 3. Walk fallback chain
  const fallbackChain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of fallbackChain) {
    const model = findAvailableModelByReference(availableModels, candidate, preferredProvider);
    if (model) return model;
  }

  return availableModels[0];
}

async function ensureSessionHasAvailableModel(session: AgentSession): Promise<boolean> {
  session.modelRegistry.authStorage.reload();

  const currentModel = session.model;
  const refreshedModel = currentModel
    ? session.modelRegistry.find(currentModel.provider, currentModel.id)
    : undefined;

  if (currentModel && refreshedModel && refreshedModel !== currentModel) {
    session.agent.setModel(refreshedModel);
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
  if (!fallbackModel) return false;

  await session.setModel(fallbackModel);
  return true;
}

export function registerAgentModelContextHandlers(
  options: RegisterModelContextHandlersOptions,
): void {
  const { getEntry, sendEvent } = options;

  ipcMain.handle(
    IpcChannels.agent.getModelState,
    async (_event, sessionId: string): Promise<SessionModelState | null> => {
      const entry = getEntry(sessionId);
      if (!entry) return null;
      let changed = false;
      try {
        changed = await ensureSessionHasAvailableModel(entry.session);
      } catch (err) {
        // Model switch failed (e.g. stale OAuth token) — still return
        // the model state so the user can manually pick a working model.
        console.warn('[agent-model-context] ensureSessionHasAvailableModel failed:', err);
      }

      cleanupUnavailableModelSelections(
        entry.session.modelRegistry.getAvailable().map((model) => ({
          provider: model.provider,
          modelId: model.id,
        })),
      );

      const state = buildModelState(entry);
      if (changed) {
        sendEvent({ type: 'model_change', sessionId, state });
      }
      return state;
    },
  );

  ipcMain.handle(
    IpcChannels.agent.setModel,
    async (_event, sessionId: string, provider: string, modelId: string): Promise<SessionModelState> => {
      const entry = getEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      const validatedProvider = validateProvider(provider);

      const model = entry.session.modelRegistry.find(validatedProvider, modelId);
      if (!model) {
        const available = entry.session.modelRegistry.getAvailable();
        const availableIds = available.map((m) => `${m.provider}/${m.id}`).join(', ');
        throw new Error(
          `Model not found: ${provider}/${modelId}. ` +
          `Available models: ${availableIds || '(none)'}`,
        );
      }

      const availableModels = entry.session.modelRegistry.getAvailable();
      const hasAuth = availableModels.some((m) => m.provider === provider && m.id === modelId);
      if (!hasAuth) {
        throw new Error(
          `No auth credentials for ${provider}/${modelId}. ` +
          `Run 'pi auth' to add credentials, then refresh.`,
        );
      }

      await entry.session.setModel(model);
      const state = buildModelState(entry);
      sendEvent({ type: 'model_change', sessionId, state });
      return state;
    },
  );

  ipcMain.handle(
    IpcChannels.agent.setThinkingLevel,
    async (_event, sessionId: string, level: string): Promise<SessionModelState> => {
      const entry = getEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      const validatedLevel = validateThinkingLevel(level);
      entry.session.setThinkingLevel(validatedLevel);
      const state = buildModelState(entry);
      sendEvent({ type: 'model_change', sessionId, state });
      return state;
    },
  );

  ipcMain.handle(
    IpcChannels.agent.getContext,
    async (_event, sessionId: string): Promise<SessionContext | null> => {
      const entry = getEntry(sessionId);
      if (!entry) return null;

      const { skills: rawSkills } = entry.loader.getSkills();
      const skills: ContextSkillInfo[] = rawSkills.map((s) => ({
        name: s.name,
        description: s.description,
        filePath: s.filePath,
      }));

      return {
        systemPrompt: entry.baseSystemPrompt,
        tools: entry.baseTools,
        skills,
        overrides: entry.contextOverrides,
      };
    },
  );

  ipcMain.handle(
    IpcChannels.agent.setContextOverrides,
    async (_event, sessionId: string, overrides: ContextOverrides | null): Promise<void> => {
      const entry = getEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      const previous = entry.contextOverrides;
      const next = applyContextOverrides(entry, overrides);

      if (!areContextOverridesEqual(previous, next)) {
        persistContextOverrides(entry.session, next);
      }
    },
  );
}
