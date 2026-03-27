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

export function registerAgentModelContextHandlers(
  options: RegisterModelContextHandlersOptions,
): void {
  const { getEntry, sendEvent } = options;

  ipcMain.handle(
    IpcChannels.agent.getModelState,
    async (_event, sessionId: string): Promise<SessionModelState | null> => {
      const entry = getEntry(sessionId);
      if (!entry) return null;
      return buildModelState(entry);
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
