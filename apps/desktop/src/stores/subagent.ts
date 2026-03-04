/**
 * Zustand store for subagent orchestration UI state.
 *
 * Subscribes to live IPC events from the main process and provides
 * snapshot hydration for mount-time recovery.
 */

import { create } from 'zustand';
import type {
  SubagentEntry,
  SubagentEvent,
  SubagentAgentSummary,
} from '@/types/ipc';

// ── Store ────────────────────────────────────────────────────

interface SubagentState {
  /** All entries keyed by run ID. */
  entries: Record<string, SubagentEntry>;
  /** Currently active workspace (for filtering). */
  activeWorkspaceId: string | null;
  /** Whether initial hydration has completed. */
  hydrated: boolean;

  /** Hydrate from a snapshot (mount-time + workspace change). */
  hydrate(workspaceId: string): Promise<void>;

  /** Abort a specific subagent. */
  abort(subagentId: string): Promise<void>;

  /** Initialize IPC event listeners. Returns cleanup function. */
  initListeners(): () => void;
}

export const useSubagentStore = create<SubagentState>((set, get) => ({
  entries: {},
  activeWorkspaceId: null,
  hydrated: false,

  async hydrate(workspaceId: string) {
    set({ activeWorkspaceId: workspaceId, hydrated: false });
    try {
      const snapshot = await window.sero.subagent.snapshot(workspaceId);
      const entries: Record<string, SubagentEntry> = {};
      for (const entry of snapshot) {
        entries[entry.id] = entry;
      }
      set({ entries, hydrated: true });
    } catch (err) {
      console.warn('[subagent-store] Hydration failed:', err);
      set({ hydrated: true });
    }
  },

  async abort(subagentId: string) {
    await window.sero.subagent.abort(subagentId);
  },

  initListeners() {
    const unsub = window.sero.subagent.onEvent((event: SubagentEvent) => {
      set((state) => {
        switch (event.type) {
          case 'subagent_start':
            return {
              entries: { ...state.entries, [event.entry.id]: event.entry },
            };

          case 'subagent_progress': {
            const existing = state.entries[event.id];
            if (!existing) return state;
            return {
              entries: {
                ...state.entries,
                [event.id]: {
                  ...existing,
                  usage: { ...existing.usage, ...event.usage },
                },
              },
            };
          }

          case 'subagent_tool_activity': {
            const existing = state.entries[event.id];
            if (!existing) return state;
            return {
              entries: {
                ...state.entries,
                [event.id]: {
                  ...existing,
                  toolActivity: event.activity,
                },
              },
            };
          }

          case 'subagent_live_output': {
            const existing = state.entries[event.id];
            if (!existing) return state;
            return {
              entries: {
                ...state.entries,
                [event.id]: {
                  ...existing,
                  liveOutput: event.text,
                },
              },
            };
          }

          case 'subagent_end': {
            const existing = state.entries[event.id];
            if (!existing) return state;
            return {
              entries: {
                ...state.entries,
                [event.id]: {
                  ...existing,
                  status: event.status,
                  error: event.error,
                  usage: event.usage,
                  durationMs: event.durationMs,
                  completedAt: existing.startedAt + event.durationMs,
                  fullResponse: event.response,
                  responsePreview: event.response?.slice(0, 500),
                  toolActivity: [],
                  liveOutput: '',
                },
              },
            };
          }

          case 'subagent_clear': {
            const next: Record<string, SubagentEntry> = {};
            for (const [id, e] of Object.entries(state.entries)) {
              if (e.parentSessionId !== event.parentSessionId) {
                next[id] = e;
              }
            }
            return { entries: next };
          }

          default:
            return state;
        }
      });
    });

    return unsub;
  },
}));
