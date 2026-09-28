import { create } from 'zustand';
import type {
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionModelState,
} from '@/types/ipc';
import type { AgentState } from '@/stores/agent-types';
import {
  appendOptimisticUserMessage,
  applyBufferedDeltas,
  clearAgentSessionBuffers,
  handleAgentStreamEvent,
} from '@/stores/agent-utils';
import { notifyPreviousSessionSwitch } from '@/stores/agent-focus';

// Deduplicate concurrent opens for the same session so every caller waits for
// the same main-process AgentSession creation instead of racing prompt calls.
// Lives outside the Zustand store because Promise values aren't serializable
// and would break devtools inspection / store rehydration.
const pendingSessionOpens = new Map<string, Promise<void>>();

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: {},
  composerPrefills: {},
  focusedSessionId: null,
  showThinkingBlocks: false,
  showMemoryBlocks: false,

  openSession: async (sessionId, sessionPath, workspaceId, runtimeBackend) => {
    notifyPreviousSessionSwitch(get().focusedSessionId, sessionId);
    set({ focusedSessionId: sessionId });

    const pending = pendingSessionOpens.get(sessionId);
    if (pending) {
      await pending;
      return;
    }

    // If already fully initialized in the pool, just focus it.
    // Check for `sessionId` field — partial entries created by events
    // (e.g. when a federated app calls agent.open via IPC directly)
    // won't have it set and need to be repaired.
    const existing = get().agents[sessionId];
    if (existing?.sessionId && (!runtimeBackend || existing.runtimeBackend === runtimeBackend)) {
      return;
    }

    const openPromise = (async () => {
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
              runtimeBackend,
              messages: partial?.messages ?? [],
              olderCursor: partial?.olderCursor ?? null,
              loadingOlderTurns: false,
              isStreaming: partial?.isStreaming ?? false,
              retry: partial?.retry ?? null,
              error: partial?.error ?? null,
              commands: partial?.commands ?? [],
              modelState: partial?.modelState ?? null,
            },
          },
        };
      });

      try {
        const page = await window.sero.agent.open(sessionId, sessionPath, workspaceId);

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
              runtimeBackend,
              messages: page.messages,
              olderCursor: page.olderCursor,
              commands,
              modelState,
            },
          },
        }));
      } catch (err) {
        console.error('[agent] openSession failed:', err);
        clearAgentSessionBuffers(sessionId);
        set((s) => {
          const { [sessionId]: _, ...rest } = s.agents;
          const { [sessionId]: _prefill, ...restPrefills } = s.composerPrefills;
          return {
            agents: rest,
            composerPrefills: restPrefills,
            focusedSessionId: s.focusedSessionId === sessionId ? null : s.focusedSessionId,
            // Note: error is stored per-agent, but since we're removing it, we just log.
          };
        });
      }
    })().finally(() => {
      pendingSessionOpens.delete(sessionId);
    });

    pendingSessionOpens.set(sessionId, openPromise);
    await openPromise;
  },

  closeSession: async (sessionId) => {
    try {
      await window.sero.agent.close(sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close session';
      set((s) => {
        const current = s.agents[sessionId];
        if (!current) return {};
        return {
          agents: {
            ...s.agents,
            [sessionId]: { ...current, error: message, isStreaming: false, retry: null },
          },
        };
      });
      return;
    }
    clearAgentSessionBuffers(sessionId);
    set((s) => {
      const { [sessionId]: _, ...rest } = s.agents;
      const { [sessionId]: _prefill, ...restPrefills } = s.composerPrefills;
      return {
        agents: rest,
        composerPrefills: restPrefills,
        focusedSessionId: s.focusedSessionId === sessionId ? null : s.focusedSessionId,
      };
    });
  },

  loadOlderTurns: async (sessionId) => {
    const agent = get().agents[sessionId];
    if (!agent?.olderCursor || agent.loadingOlderTurns) return;
    const cursor = agent.olderCursor;
    set((s) => ({
      agents: { ...s.agents, [sessionId]: { ...s.agents[sessionId], loadingOlderTurns: true } },
    }));

    try {
      const page = await window.sero.agent.loadOlderTurns(sessionId, cursor);
      set((s) => {
        const current = s.agents[sessionId];
        if (!current) return s;
        // A reload landed while this page was in flight: the page belongs to
        // the window that asked for it, not to the one now shown.
        if (current.olderCursor !== cursor && !page.replaces) {
          return { agents: { ...s.agents, [sessionId]: { ...current, loadingOlderTurns: false } } };
        }
        return {
          agents: {
            ...s.agents,
            [sessionId]: {
              ...current,
              messages: page.replaces ? page.messages : [...page.messages, ...current.messages],
              olderCursor: page.olderCursor,
              loadingOlderTurns: false,
            },
          },
        };
      });
    } catch (err) {
      console.error('[agent] loadOlderTurns failed:', err);
      set((s) => {
        const current = s.agents[sessionId];
        if (!current) return s;
        return { agents: { ...s.agents, [sessionId]: { ...current, loadingOlderTurns: false } } };
      });
    }
  },

  sendPrompt: async (sessionId, text, attachments) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    // Optimistically add the user message so it appears immediately.
    // The main process also sends a message_start event for user messages,
    // but we skip those in the event handler to avoid duplicates.
    const userMessageId = appendOptimisticUserMessage(set, sessionId, text, {
      attachments,
    });

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
            retry: null,
          },
        },
      }));
    }
  },

  steerAgent: async (sessionId, text) => {
    const agent = get().agents[sessionId];
    if (!agent) return;

    const userMessageId = appendOptimisticUserMessage(set, sessionId, text);

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

  focusSession: (sessionId) => {
    notifyPreviousSessionSwitch(get().focusedSessionId, sessionId);
    set({ focusedSessionId: sessionId });
  },

  clearFocus: () => {
    notifyPreviousSessionSwitch(get().focusedSessionId, null);
    set({ focusedSessionId: null });
  },

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

  toggleMemoryBlocks: () => set((s) => ({ showMemoryBlocks: !s.showMemoryBlocks })),

  setComposerPrefill: (sessionId, prefill) =>
    set((s) => ({
      composerPrefills: {
        ...s.composerPrefills,
        [sessionId]: prefill,
      },
    })),

  clearComposerPrefill: (sessionId, requestId) =>
    set((s) => {
      const current = s.composerPrefills[sessionId];
      if (!current) return s;
      if (requestId && current.requestId !== requestId) return s;
      const { [sessionId]: _removed, ...restPrefills } = s.composerPrefills;
      return { composerPrefills: restPrefills };
    }),

  initEventListener: () => {
    const flushDeltas = () => applyBufferedDeltas(set);

    const unsubscribe = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      handleAgentStreamEvent(event, set, get, flushDeltas);
    });

    return unsubscribe;
  },
}));
