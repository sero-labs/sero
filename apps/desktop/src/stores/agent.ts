import { create } from 'zustand';
import type {
  ChatMessage,
  ChatAttachment,
  ChatToolCallMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionModelState,
  ChatAssistantMessage,
} from '@/types/ipc';
import type {
  CollaborationEvent,
  CollaborationStatus,
  CollaborationResult,
  CollaborationSpecialistOutput,
} from '@/types/collaboration';
import { useSessionStore } from '@/stores/sessions';
import { useContainerStore } from '@/stores/container';

// ── Helpers ────────────────────────────────────────────────────

/** Patch a single field on an assistant message by ID. */
function patchAssistant(
  agents: Record<string, AgentInstance>,
  sid: string,
  messageId: string,
  patch: (msg: ChatAssistantMessage) => ChatAssistantMessage,
) {
  return {
    ...agents,
    [sid]: {
      ...agents[sid],
      messages: agents[sid].messages.map((m) =>
        m.type === 'assistant' && m.id === messageId ? patch(m) : m,
      ),
    },
  };
}

// ── Types ──────────────────────────────────────────────────────

/** State for a single agent session in the pool. */
export interface AgentInstance {
  sessionId: string;
  sessionPath: string;
  workspaceId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  /** Available slash commands for this session (fetched on open). */
  commands: SeroSlashCommandInfo[];
  /** Current model + thinking level state. */
  modelState: SessionModelState | null;
}

interface AgentState {
  /** All active agent instances, keyed by session ID. */
  agents: Record<string, AgentInstance>;
  /** Which session is currently shown in the ChatPanel. */
  focusedSessionId: string | null;
  /** Whether to display thinking/reasoning blocks in the chat. */
  showThinkingBlocks: boolean;
  /** Whether 4-agent collaboration mode is enabled. */
  collaborationMode: boolean;
  /** Current collaboration status for the focused session. */
  collaborationStatus: CollaborationStatus;
  /** Last collaboration result (specialist outputs for expandable display). */
  collaborationResult: CollaborationResult | null;
  /** Live specialist outputs as they complete (before final result). */
  collaborationSpecialists: CollaborationSpecialistOutput[];

  // ── Actions ────────────────────────────────────────────────

  /** Open a session — creates an AgentSession in the main-process pool. */
  openSession: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<void>;
  /** Close a session — disposes its AgentSession. */
  closeSession: (sessionId: string) => Promise<void>;
  /** Send a prompt to a specific session, optionally with file attachments. */
  sendPrompt: (sessionId: string, text: string, attachments?: ChatAttachment[]) => Promise<void>;
  /** Steer the agent mid-stream (interrupt after current tool, skip remaining). */
  steerAgent: (sessionId: string, text: string) => Promise<void>;
  /** Abort a specific session. */
  abort: (sessionId: string) => Promise<void>;
  /** Focus a session in the ChatPanel. */
  focusSession: (sessionId: string) => void;
  /** Clear focus (no session shown in ChatPanel). */
  clearFocus: () => void;
  /** Reload resources (skills, prompts, extensions) for a session. */
  reloadResources: (sessionId: string) => Promise<void>;
  /** Set the model for a session. */
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<void>;
  /** Set thinking level for a session. */
  setThinkingLevel: (sessionId: string, level: string) => Promise<void>;
  /** Fetch model state for a session. */
  fetchModelState: (sessionId: string) => Promise<void>;
  /** Toggle visibility of thinking/reasoning blocks. */
  toggleThinkingBlocks: () => void;
  /** Toggle 4-agent collaboration mode on/off. */
  toggleCollaborationMode: () => void;
  /** Send a prompt through the collaboration framework. */
  sendCollaborationPrompt: (sessionId: string, text: string) => Promise<void>;

  /** Subscribe to main-process events. Returns cleanup function. */
  initEventListener: () => () => void;
  /** Subscribe to collaboration events. Returns cleanup function. */
  initCollaborationListener: () => () => void;
}

// ── Store ──────────────────────────────────────────────────────

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: {},
  focusedSessionId: null,
  showThinkingBlocks: false,
  collaborationMode: false,
  collaborationStatus: 'idle',
  collaborationResult: null,
  collaborationSpecialists: [],

  openSession: async (sessionId, sessionPath, workspaceId) => {
    // If already fully initialized in pool, just focus it.
    // Check for `sessionId` field — partial entries created by events
    // (e.g. when a federated app calls agent.open via IPC directly)
    // won't have it set and need to be repaired.
    if (get().agents[sessionId]?.sessionId) {
      set({ focusedSessionId: sessionId });
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
        focusedSessionId: sessionId,
      };
    });

    try {
      const history = await window.sero.agent.open(sessionId, sessionPath, workspaceId);

      // Fetch available slash commands for this session (non-blocking on failure)
      let commands: SeroSlashCommandInfo[] = [];
      try {
        commands = await window.sero.agent.getCommands(sessionId);
      } catch (cmdErr) {
        console.warn('[agent] Failed to fetch commands:', cmdErr);
      }

      // Fetch initial model state (non-blocking)
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
          // Note: error is stored per-agent, but since we're removing it, we just log
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

  focusSession: (sessionId) => set({ focusedSessionId: sessionId }),

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

  toggleCollaborationMode: () => set((s) => ({ collaborationMode: !s.collaborationMode })),

  sendCollaborationPrompt: async (sessionId, text) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    // Reset collaboration state
    set({
      collaborationStatus: 'specialists',
      collaborationResult: null,
      collaborationSpecialists: [],
    });

    // Optimistically add the user message
    const userMessageId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMsg: ChatMessage = { type: 'user', id: userMessageId, text };
    set((s) => ({
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
      const result = await window.sero.collaboration.prompt(sessionId, agent.workspaceId, text);

      // Add the synthesized response as an assistant message
      const collabResult = result as CollaborationResult;
      const assistantMsg: ChatMessage = {
        type: 'assistant',
        id: `collab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: collabResult.finalResponse,
        isStreaming: false,
      };

      set((s) => ({
        collaborationStatus: 'complete',
        collaborationResult: collabResult,
        agents: {
          ...s.agents,
          [sessionId]: {
            ...s.agents[sessionId],
            isStreaming: false,
            messages: [...s.agents[sessionId].messages, assistantMsg],
          },
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Collaboration failed';
      set((s) => ({
        collaborationStatus: 'error',
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

      // Ignore events for sessions we don't track (already closed)
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
            // Mark any in-flight tools as cancelled (they'll never receive a tool_end)
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

        // Container lifecycle events — update container store
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
    const unsubscribe = window.sero.collaboration.onEvent((event: CollaborationEvent) => {
      switch (event.type) {
        case 'collab_start':
          set({ collaborationStatus: 'specialists', collaborationSpecialists: [], collaborationResult: null });
          break;

        case 'collab_phase':
          set({ collaborationStatus: event.phase === 'synthesis' ? 'synthesis' : 'specialists' });
          break;

        case 'collab_specialist_end':
          set((s) => ({
            collaborationSpecialists: [
              ...s.collaborationSpecialists,
              { role: event.role, agentName: event.agentName, response: event.response, error: event.error, durationMs: 0 },
            ],
          }));
          break;

        case 'collab_end':
          set({ collaborationStatus: 'complete', collaborationResult: event.result });
          break;

        case 'collab_error':
          set({ collaborationStatus: 'error' });
          break;
      }
    });

    return unsubscribe;
  },
}));

// ── Selectors ──────────────────────────────────────────────────

/** The focused agent instance (shown in ChatPanel), or null. */
export function useFocusedAgent(): AgentInstance | null {
  const agents = useAgentStore((s) => s.agents);
  const focusedId = useAgentStore((s) => s.focusedSessionId);
  if (!focusedId) return null;
  return agents[focusedId] ?? null;
}

/** IDs of sessions currently streaming (for sidebar active indicators). */
export function useStreamingSessionIds(): string[] {
  const agents = useAgentStore((s) => s.agents);
  return Object.values(agents)
    .filter((a) => a.isStreaming)
    .map((a) => a.sessionId);
}

/** Count of active agent sessions in the pool. */
export function useActiveAgentCount(): number {
  const agents = useAgentStore((s) => s.agents);
  return Object.keys(agents).length;
}

/** Check if a specific session has an active agent. */
export function useIsSessionActive(sessionId: string): boolean {
  return useAgentStore((s) => !!s.agents[sessionId]);
}

/** Slash commands available for the focused session. */
export function useFocusedCommands(): SeroSlashCommandInfo[] {
  const agents = useAgentStore((s) => s.agents);
  const focusedId = useAgentStore((s) => s.focusedSessionId);
  if (!focusedId) return [];
  return agents[focusedId]?.commands ?? [];
}
