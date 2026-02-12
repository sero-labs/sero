import { create } from 'zustand';
import type {
  ChatMessage,
  ChatAssistantMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
} from '@/types/ipc';

// ── Types ──────────────────────────────────────────────────────

interface AgentState {
  /** Messages in the active session. */
  messages: ChatMessage[];
  /** True while the agent is processing a prompt. */
  isStreaming: boolean;
  /** Session path currently open, or null. */
  activeSessionPath: string | null;
  /** Last error from the agent. */
  error: string | null;

  // ── Actions ────────────────────────────────────────────────
  openSession: (sessionPath: string) => Promise<void>;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  closeSession: () => Promise<void>;
  /** Call once on mount to start listening to main-process events. Returns cleanup. */
  initEventListener: () => () => void;
}

// ── Store ──────────────────────────────────────────────────────

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeSessionPath: null,
  error: null,

  openSession: async (sessionPath: string) => {
    // Close existing first
    const { activeSessionPath } = get();
    if (activeSessionPath) {
      await window.sero.agent.close();
    }

    set({ messages: [], isStreaming: false, error: null, activeSessionPath: sessionPath });

    try {
      const history = await window.sero.agent.open(sessionPath);
      set({ messages: history });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open session';
      console.error('[agent] openSession failed:', err);
      set({ error: message, activeSessionPath: null });
    }
  },

  sendPrompt: async (text: string) => {
    if (!get().activeSessionPath) return;

    set({ error: null });

    try {
      // prompt() resolves when the agent finishes — events stream in via onEvent
      await window.sero.agent.prompt(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prompt failed';
      console.error('[agent] sendPrompt failed:', err);
      set({ error: message, isStreaming: false });
    }
  },

  abort: async () => {
    try {
      await window.sero.agent.abort();
    } catch (err) {
      console.error('[agent] abort failed:', err);
    }
  },

  closeSession: async () => {
    try {
      await window.sero.agent.close();
    } catch {
      // Ignore close errors
    }
    set({ messages: [], isStreaming: false, activeSessionPath: null, error: null });
  },

  initEventListener: () => {
    const unsubscribe = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      const { messages } = get();

      switch (event.type) {
        case 'agent_start':
          set({ isStreaming: true });
          break;

        case 'agent_end':
          set({ isStreaming: false });
          break;

        case 'messages_loaded':
          set({ messages: event.messages });
          break;

        case 'message_start': {
          set({ messages: [...messages, event.message] });
          break;
        }

        case 'text_delta': {
          // Accumulate delta into the matching assistant message
          set({
            messages: messages.map((m) =>
              m.type === 'assistant' && m.id === event.messageId
                ? { ...m, text: m.text + event.delta }
                : m,
            ),
          });
          break;
        }

        case 'message_end': {
          // Finalise the assistant message
          set({
            messages: messages.map((m) =>
              m.type === 'assistant' && m.id === event.messageId
                ? { ...m, text: event.text, isStreaming: false }
                : m,
            ),
          });
          break;
        }

        case 'tool_start': {
          set({ messages: [...messages, event.tool] });
          break;
        }

        case 'tool_end': {
          set({
            messages: messages.map((m) =>
              m.type === 'tool' && m.toolCallId === event.toolCallId
                ? {
                    ...m,
                    output: event.output,
                    isError: event.isError,
                    state: event.isError ? 'error' : 'completed',
                  } as ChatToolCallMessage
                : m,
            ),
          });
          break;
        }

        case 'error':
          set({ error: event.error, isStreaming: false });
          break;
      }
    });

    return unsubscribe;
  },
}));
