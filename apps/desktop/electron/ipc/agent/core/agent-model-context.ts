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
  getBaseSystemPrompt,
  setBaseSystemPrompt,
  stripDisabledSkills,
  validateProvider,
  validateThinkingLevel,
} from './agent-helpers';
import { getConfiguredModelFallbackChain } from '../../../shared/settings/model-fallback-chain';

export interface AgentPoolContextEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
  contextOverrides: ContextOverrides | null;
  originalToolNames: string[] | null;
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

  const preferredProvider = session.settingsManager.getDefaultProvider();
  const savedDefaultModel = findAvailableModelByProviderAndId(
    availableModels,
    preferredProvider,
    session.settingsManager.getDefaultModel(),
  );
  if (savedDefaultModel) return savedDefaultModel;

  const globalSettings = session.settingsManager.getGlobalSettings() as Record<string, unknown>;
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
      const changed = await ensureSessionHasAvailableModel(entry.session);
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

      const state = entry.session.agent.state;

      const tools: ContextToolInfo[] = state.tools.map((t) => ({
        name: t.name,
        label: (t as any).label,
        description: t.description,
      }));

      const { skills: rawSkills } = entry.loader.getSkills();
      const skills: ContextSkillInfo[] = rawSkills.map((s) => ({
        name: s.name,
        description: s.description,
        filePath: s.filePath,
      }));

      return {
        systemPrompt: state.systemPrompt ?? '',
        tools,
        skills,
      };
    },
  );

  ipcMain.handle(
    IpcChannels.agent.setContextOverrides,
    async (_event, sessionId: string, overrides: ContextOverrides | null): Promise<void> => {
      const entry = getEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      const session = entry.session;

      if (!entry.originalToolNames) {
        entry.originalToolNames = session.getActiveToolNames();
      }

      entry.contextOverrides = overrides;

      if (!overrides) {
        session.setActiveToolsByName(entry.originalToolNames!);
        return;
      }

      const toolNames = entry.originalToolNames!.slice();
      if (overrides.disabledTools?.length) {
        const disabled = new Set(overrides.disabledTools);
        session.setActiveToolsByName(toolNames.filter((n) => !disabled.has(n)));
      } else {
        session.setActiveToolsByName(toolNames);
      }

      if (
        overrides.disabledSkills?.length &&
        (overrides.systemPrompt === undefined || overrides.systemPrompt === null)
      ) {
        const disabled = new Set(overrides.disabledSkills);
        const prompt = getBaseSystemPrompt(session);
        if (typeof prompt === 'string') {
          const filtered = stripDisabledSkills(prompt, disabled);
          setBaseSystemPrompt(session, filtered);
        }
      }

      if (overrides.systemPrompt !== undefined && overrides.systemPrompt !== null) {
        setBaseSystemPrompt(session, overrides.systemPrompt);
      }
    },
  );
}
