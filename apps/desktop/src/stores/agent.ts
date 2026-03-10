import { create } from 'zustand';
import type {
  ChatMessage,
  ChatAttachment,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionModelState,
} from '@/types/ipc';
import type { CollaborationEvent, CollaborationStrategy, DebateConfig } from '@/types/collaboration';
import {
  applyCollaborationEvent,
  removeCollaborationSession,
  resetCollaborationSession,
  setCollaborationErrorForSession,
  setCollaborationStrategyForSession,
  setDebateConfigForSession,
  startCollaborationForSession,
  toggleCollaborationModeForSession,
} from '@/stores/agent-collaboration';
import type { AgentState } from '@/stores/agent-types';
import {
  patchAssistant,
  drainDeltaBuffer,
  handleAgentStreamEvent,
} from '@/stores/agent-utils';

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: {},
  focusedSessionId: null,
  showThinkingBlocks: false,
  collaborations: {},

  openSession: async (sessionId, sessionPath, workspaceId) => {
    // Reset collaboration mode when switching sessions.
    set((s) => ({
      focusedSessionId: sessionId,
      collaborations: resetCollaborationSession(s.collaborations, sessionId),
    }));

    // If already fully initialized in the pool, just focus it.
    // Check for `sessionId` field — partial entries created by events
    // (e.g. when a federated app calls agent.open via IPC directly)
    // won't have it set and need to be repaired.
    if (get().agents[sessionId]?.sessionId) {
      return;
    }

    // Create or repair placeholder — preserve any messages/state
    // accumulated from events before the store was properly initialized.
    set((s) => {
      const partial = s.agents[sessionId];
      return {
        agents: {
          ...s.agents,
          [sessionId]: {
            sessionId,
            sessionPath,
            workspaceId,
            messages: partial?.messages ?? [],
            isStreaming: partial?.isStreaming ?? false,
            error: partial?.error ?? null,
            commands: partial?.commands ?? [],
            modelState: partial?.modelState ?? null,
          },
        },
      };
    });

    try {
      const history = await window.sero.agent.open(sessionId, sessionPath, workspaceId);

      // Fetch available slash commands for this session (non-blocking on failure).
      let commands: SeroSlashCommandInfo[] = [];
      try {
        commands = await window.sero.agent.getCommands(sessionId);
      } catch (cmdErr) {
        console.warn('[agent] Failed to fetch commands:', cmdErr);
      }

      // Fetch initial model state (non-blocking).
      let modelState: SessionModelState | null = null;
      try {
        modelState = await window.sero.agent.getModelState(sessionId);
      } catch (err) {
        console.warn('[agent] Failed to fetch model state:', err);
      }
      set((s) => ({
        agents: {
          ...s.agents,
          [sessionId]: {
            ...s.agents[sessionId],
            messages: history,
            commands,
            modelState,
          },
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open session';
      console.error('[agent] openSession failed:', err);
      set((s) => {
        const { [sessionId]: _, ...rest } = s.agents;
        return {
          agents: rest,
          focusedSessionId: s.focusedSessionId === sessionId ? null : s.focusedSessionId,
          // Note: error is stored per-agent, but since we're removing it, we just log.
          collaborations: removeCollaborationSession(s.collaborations, sessionId),
        };
      });
    }
  },

  closeSession: async (sessionId) => {
    try {
      await window.sero.agent.close(sessionId);
    } catch {
      // Ignore close errors
    }
    set((s) => {
      const { [sessionId]: _, ...rest } = s.agents;
      return {
        agents: rest,
        focusedSessionId: s.focusedSessionId === sessionId ? null : s.focusedSessionId,
        collaborations: removeCollaborationSession(s.collaborations, sessionId),
      };
    });
  },

  sendPrompt: async (sessionId, text, attachments) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    // Optimistically add the user message so it appears immediately.
    // The main process also sends a message_start event for user messages,
    // but we skip those in the event handler to avoid duplicates.
    const userMessageId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMsg: ChatMessage = {
      type: 'user',
      id: userMessageId,
      text,
      attachments,
    };
    set((s) => ({
      agents: {
        ...s.agents,
        [sessionId]: {
          ...s.agents[sessionId],
          error: null,
          messages: [...s.agents[sessionId].messages, userMsg],
        },
      },
    }));

    try {
      await window.sero.agent.prompt(sessionId, text, attachments, userMessageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prompt failed';
      console.error('[agent] sendPrompt failed:', err);
      set((s) => ({
        agents: {
          ...s.agents,
          [sessionId]: {
            ...s.agents[sessionId],
            error: message,
            isStreaming: false,
          },
        },
      }));
    }
  },

  steerAgent: async (sessionId, text) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    // Optimistically add the user message (same as sendPrompt).
    const userMessageId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMsg: ChatMessage = { type: 'user', id: userMessageId, text };
    set((s) => ({
      agents: {
        ...s.agents,
        [sessionId]: {
          ...s.agents[sessionId],
          error: null,
          messages: [...s.agents[sessionId].messages, userMsg],
        },
      },
    }));

    try {
      await window.sero.agent.steer(sessionId, text, userMessageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Steer failed';
      console.error('[agent] steerAgent failed:', err);
      set((s) => ({
        agents: {
          ...s.agents,
          [sessionId]: { ...s.agents[sessionId], error: message },
        },
      }));
    }
  },

  abort: async (sessionId) => {
    try {
      await window.sero.agent.abort(sessionId);
    } catch (err) {
      console.error('[agent] abort failed:', err);
    }
  },

  focusSession: (sessionId) =>
    set((s) => ({
      focusedSessionId: sessionId,
      collaborations: resetCollaborationSession(s.collaborations, sessionId),
    })),

  clearFocus: () => set({ focusedSessionId: null }),

  reloadResources: async (sessionId) => {
    try {
      const commands = await window.sero.agent.reloadResources(sessionId);
      set((s) => {
        const agent = s.agents[sessionId];
        if (!agent) return s;
        return {
          agents: {
            ...s.agents,
            [sessionId]: { ...agent, commands },
          },
        };
      });
    } catch (err) {
      console.error('[agent] reloadResources failed:', err);
    }
  },

  setModel: async (sessionId, provider, modelId) => {
    try {
      const state = await window.sero.agent.setModel(sessionId, provider, modelId);
      set((s) => {
        const agent = s.agents[sessionId];
        if (!agent) return s;
        return { agents: { ...s.agents, [sessionId]: { ...agent, modelState: state } } };
      });
    } catch (err) {
      console.error('[agent] setModel failed:', err);
    }
  },

  setThinkingLevel: async (sessionId, level) => {
    try {
      const state = await window.sero.agent.setThinkingLevel(sessionId, level);
      set((s) => {
        const agent = s.agents[sessionId];
        if (!agent) return s;
        return { agents: { ...s.agents, [sessionId]: { ...agent, modelState: state } } };
      });
    } catch (err) {
      console.error('[agent] setThinkingLevel failed:', err);
    }
  },

  fetchModelState: async (sessionId) => {
    try {
      const state = await window.sero.agent.getModelState(sessionId);
      set((s) => {
        const agent = s.agents[sessionId];
        if (!agent) return s;
        return { agents: { ...s.agents, [sessionId]: { ...agent, modelState: state } } };
      });
    } catch (err) {
      console.error('[agent] fetchModelState failed:', err);
    }
  },

  toggleThinkingBlocks: () => set((s) => ({ showThinkingBlocks: !s.showThinkingBlocks })),

  toggleCollaborationMode: () =>
    set((s) => {
      if (!s.focusedSessionId) return s;
      return {
        collaborations: toggleCollaborationModeForSession(s.collaborations, s.focusedSessionId),
      };
    }),

  setCollaborationStrategy: (strategy: CollaborationStrategy) =>
    set((s) => {
      if (!s.focusedSessionId) return s;
      return {
        collaborations: setCollaborationStrategyForSession(s.collaborations, s.focusedSessionId, strategy),
      };
    }),

  setDebateConfig: (config: Partial<DebateConfig>) =>
    set((s) => {
      if (!s.focusedSessionId) return s;
      return {
        collaborations: setDebateConfigForSession(s.collaborations, s.focusedSessionId, config),
      };
    }),

  sendCollaborationPrompt: async (sessionId, text) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    // Read current strategy + config before resetting state
    const collabState = get().collaborations[sessionId];
    const strategy = collabState?.strategy ?? 'standard';
    const debateConfig = collabState?.debateConfig;

    const userMessageId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMsg: ChatMessage = { type: 'user', id: userMessageId, text };
    set((s) => ({
      collaborations: startCollaborationForSession(s.collaborations, sessionId),
      agents: {
        ...s.agents,
        [sessionId]: {
          ...s.agents[sessionId],
          error: null,
          isStreaming: true,
          messages: [...s.agents[sessionId].messages, userMsg],
        },
      },
    }));

    try {
      await window.sero.collaboration.prompt(sessionId, agent.workspaceId, text, {
        strategy,
        debate: strategy === 'debate' ? debateConfig : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Collaboration failed';
      set((s) => ({
        collaborations: setCollaborationErrorForSession(s.collaborations, sessionId),
        agents: {
          ...s.agents,
          [sessionId]: {
            ...s.agents[sessionId],
            error: message,
            isStreaming: false,
          },
        },
      }));
    }
  },

  initEventListener: () => {
    // Flush buffered text/thinking deltas into the store in one batch.
    const flushDeltas = () => {
      const { text, thinking } = drainDeltaBuffer();
      if (text.size === 0 && thinking.size === 0) return;
      set((s) => {
        let agents = s.agents;
        for (const [sessionId, msgMap] of text) {
          for (const [messageId, delta] of msgMap) {
            agents = patchAssistant(agents, sessionId, messageId, (m) => ({
              ...m, text: m.text + delta,
            }));
          }
        }
        for (const [sessionId, msgMap] of thinking) {
          for (const [messageId, delta] of msgMap) {
            agents = patchAssistant(agents, sessionId, messageId, (m) => ({
              ...m, thinking: (m.thinking ?? '') + delta,
            }));
          }
        }
        return { agents };
      });
    };

    const unsubscribe = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      handleAgentStreamEvent(event, set, get, flushDeltas);
    });

    return unsubscribe;
  },

  initCollaborationListener: () => {
    return window.sero.collaboration.onEvent((event: CollaborationEvent) => {
      set((s) => ({
        collaborations: applyCollaborationEvent(s.collaborations, event),
      }));
    });
  },
}));
