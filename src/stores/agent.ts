import { create } from 'zustand';
import type {
  ChatMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
} from '@/types/ipc';

// ── Types ──────────────────────────────────────────────────────

/** State for a single agent session in the pool. */
export interface AgentInstance {
  sessionId: string;
  sessionPath: string;
  workspaceId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
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
  /** Send a prompt to a specific session. */
  sendPrompt: (sessionId: string, text: string) => Promise<void>;
  /** Abort a specific session. */
  abort: (sessionId: string) => Promise<void>;
  /** Focus a session in the ChatPanel. */
  focusSession: (sessionId: string) => void;
  /** Clear focus (no session shown in ChatPanel). */
  clearFocus: () => void;

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
        },
      },
      focusedSessionId: sessionId,
    }));

    try {
      const history = await window.sero.agent.open(sessionId, sessionPath, workspaceId);
      set((s) => ({
        agents: {
          ...s.agents,
          [sessionId]: {
            ...s.agents[sessionId],
            messages: history,
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

  sendPrompt: async (sessionId, text) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    set((s) => ({
      agents: {
        ...s.agents,
        [sessionId]: { ...s.agents[sessionId], error: null },
      },
    }));

    try {
      await window.sero.agent.prompt(sessionId, text);
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
