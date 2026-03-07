import { create } from 'zustand';
import type {
  ChatMessage,
  ChatAttachment,
  ChatToolCallMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionModelState,
} from '@/types/ipc';
import type { CollaborationEvent } from '@/types/collaboration';
import { useSessionStore } from '@/stores/sessions';
import { useContainerStore } from '@/stores/container';
import {
  applyCollaborationEvent,
  removeCollaborationSession,
  resetCollaborationSession,
  setCollaborationErrorForSession,
  startCollaborationForSession,
  toggleCollaborationModeForSession,
} from '@/stores/agent-collaboration';
import type { AgentState } from '@/stores/agent-types';
import { patchAssistant } from '@/stores/agent-utils';

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

  sendCollaborationPrompt: async (sessionId, text) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    // Reset collaboration state for this session before the new run starts.
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
      // This runs the 4-agent collaboration AND then feeds the synthesis
      // through the main agent session. The main session's response streams
      // back via the normal agent event channel (message_start, text_delta,
      // message_end), so the conversation is fully persisted and follow-ups
      // have context. We do NOT manually add the assistant message here.
      await window.sero.collaboration.prompt(
        sessionId, agent.workspaceId, text, userMessageId,
      );
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
    const unsubscribe = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      const { agents } = get();
      const sid = event.sessionId;

      // Ignore events for sessions we don't track (already closed).
      if (!agents[sid] && event.type !== 'agent_start' && event.type !== 'message_start') {
        return;
      }

      switch (event.type) {
        case 'agent_start':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: { ...s.agents[sid], isStreaming: true },
            },
          }));
          break;

        case 'agent_end':
          set((s) => {
            const agent = s.agents[sid];
            if (!agent) return s;
            // Mark any in-flight tools as cancelled (they'll never receive a tool_end).
            const messages = agent.messages.map((m) =>
              m.type === 'tool' && (m.state === 'pending' || m.state === 'running')
                ? { ...m, state: 'cancelled' as const }
                : m,
            );
            return {
              agents: {
                ...s.agents,
                [sid]: { ...agent, isStreaming: false, messages },
              },
            };
          });
          break;

        case 'messages_loaded':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: { ...s.agents[sid], messages: event.messages },
            },
          }));
          break;

        case 'message_start':
          // Skip user messages — they're added optimistically in sendPrompt
          // to avoid duplicates and ensure attachments render immediately.
          if (event.message.type === 'user') break;

          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: {
                ...s.agents[sid],
                messages: [...(s.agents[sid]?.messages ?? []), event.message],
              },
            },
          }));
          break;

        case 'text_delta':
          set((s) => ({
            agents: patchAssistant(s.agents, sid, event.messageId, (m) => ({
              ...m, text: m.text + event.delta,
            })),
          }));
          break;

        case 'thinking_delta':
          set((s) => ({
            agents: patchAssistant(s.agents, sid, event.messageId, (m) => ({
              ...m, thinking: (m.thinking ?? '') + event.delta,
            })),
          }));
          break;

        case 'message_end':
          set((s) => ({
            agents: patchAssistant(s.agents, sid, event.messageId, (m) => ({
              ...m, text: event.text, thinking: event.thinking, isStreaming: false,
            })),
          }));
          break;

        case 'user_checkpoint': {
          const { userMessageId, checkpoint } = event;
          set((s) => ({
            agents: { ...s.agents, [sid]: { ...s.agents[sid],
              messages: s.agents[sid].messages.map((m) =>
                m.type === 'user' && m.id === userMessageId
                  ? ({ ...m, checkpoint } as ChatMessage) : m),
            } },
          }));
          break;
        }

        case 'tool_start':
          set((s) => ({
            agents: { ...s.agents, [sid]: { ...s.agents[sid],
              messages: [...s.agents[sid].messages, event.tool],
            } },
          }));
          break;

        case 'tool_end':
          set((s) => ({
            agents: { ...s.agents, [sid]: { ...s.agents[sid],
              messages: s.agents[sid].messages.map((m) =>
                m.type === 'tool' && m.toolCallId === event.toolCallId
                  ? { ...m, output: event.output, isError: event.isError,
                      state: event.isError ? 'error' : 'completed' } as ChatToolCallMessage
                  : m),
            } },
          }));
          break;

        case 'session_name':
          useSessionStore.getState().updateSessionName(sid, event.name);
          break;

        case 'model_change':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: { ...s.agents[sid], modelState: event.state },
            },
          }));
          break;

        case 'error':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: {
                ...s.agents[sid],
                error: event.error,
                isStreaming: false,
              },
            },
          }));
          break;

        // Container lifecycle events — update container store.
        case 'container_starting':
          useContainerStore.getState().setStarting(event.workspaceId);
          break;
        case 'container_ready':
          useContainerStore.getState().setRunning(event.workspaceId, event.ipAddress);
          break;
        case 'container_error':
          useContainerStore.getState().setError(event.workspaceId, event.error);
          break;
      }
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
