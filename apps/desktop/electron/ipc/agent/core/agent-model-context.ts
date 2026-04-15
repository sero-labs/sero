import { ipcMain } from 'electron';
import type { AgentSession, DefaultResourceLoader } from '@mariozechner/pi-coding-agent';

import { IpcChannels } from '@/types/ipc-channels';
import type {
  AgentStreamEvent,
  ContextOverrides,
  ContextSkillInfo,
  ContextToolInfo,
  SessionContext,
  SessionModelState,
} from '@/types/ipc';
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
import { ensureSessionHasAvailableModel } from './agent-session-model-sync';

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
