import { create } from 'zustand';
import type {
  ChatMessage,
  ChatAttachment,
  ChatToolCallMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionModelState,
} from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';
import { useContainerStore } from '@/stores/container';

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

  // ── Actions ────────────────────────────────────────────────

  /** Open a session — creates an AgentSession in the main-process pool. */
  openSession: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<void>;
  /** Close a session — disposes its AgentSession. */
  closeSession: (sessionId: string) => Promise<void>;
  /** Send a prompt to a specific session, optionally with file attachments. */
  sendPrompt: (sessionId: string, text: string, attachments?: ChatAttachment[]) => Promise<void>;
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

  /** Subscribe to main-process events. Returns cleanup function. */
  initEventListener: () => () => void;
}

// ── Store ──────────────────────────────────────────────────────

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: {},
  focusedSessionId: null,

  openSession: async (sessionId, sessionPath, workspaceId) => {
    // If already in pool, just focus it
    if (get().agents[sessionId]) {
      set({ focusedSessionId: sessionId });
      return;
    }

    // Create placeholder immediately so UI shows loading state
    set((s) => ({
      agents: {
        ...s.agents,
        [sessionId]: {
          sessionId,
          sessionPath,
          workspaceId,
          messages: [],
          isStreaming: false,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      focusedSessionId: sessionId,
    }));

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
    const userMsg: ChatMessage = {
      type: 'user',
      id: `usr-${Date.now()}`,
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
      await window.sero.agent.prompt(sessionId, text, attachments);
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
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: { ...s.agents[sid], isStreaming: false },
            },
          }));
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
            agents: {
              ...s.agents,
              [sid]: {
                ...s.agents[sid],
                messages: s.agents[sid].messages.map((m) =>
                  m.type === 'assistant' && m.id === event.messageId
                    ? { ...m, text: m.text + event.delta }
                    : m,
                ),
              },
            },
          }));
          break;

        case 'message_end':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: {
                ...s.agents[sid],
                messages: s.agents[sid].messages.map((m) =>
                  m.type === 'assistant' && m.id === event.messageId
                    ? { ...m, text: event.text, isStreaming: false }
                    : m,
                ),
              },
            },
          }));
          break;

        case 'tool_start':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: {
                ...s.agents[sid],
                messages: [...s.agents[sid].messages, event.tool],
              },
            },
          }));
          break;

        case 'tool_end':
          set((s) => ({
            agents: {
              ...s.agents,
              [sid]: {
                ...s.agents[sid],
                messages: s.agents[sid].messages.map((m) =>
                  m.type === 'tool' && m.toolCallId === event.toolCallId
                    ? {
                        ...m,
                        output: event.output,
                        isError: event.isError,
                        state: event.isError ? 'error' : 'completed',
                      } as ChatToolCallMessage
                    : m,
                ),
              },
            },
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
