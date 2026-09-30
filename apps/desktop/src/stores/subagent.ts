/**
 * Zustand store for subagent orchestration UI state.
 *
 * Subscribes to live IPC events from the main process and provides
 * snapshot hydration for mount-time recovery.
 */

import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type {
  SubagentEntry,
  SubagentEvent,
} from '@/types/ipc';
import { TERMINAL_STATUSES } from './subagent-constants';

interface SubagentOutputState {
  liveOutput: string;
  fullResponse?: string;
  error?: string;
}

interface SplitEntryOutput {
  entry: SubagentEntry;
  output: SubagentOutputState;
}

function preview(text: string | undefined, maxChars = 500): string | undefined {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function splitEntryOutput(entry: SubagentEntry): SplitEntryOutput {
  const fullResponse = entry.fullResponse;
  const responsePreview = entry.responsePreview ?? preview(fullResponse);
  return {
    entry: {
      ...entry,
      error: preview(entry.error),
      fullResponse: undefined,
      responsePreview,
      liveOutput: '',
    },
    output: {
      liveOutput: entry.liveOutput,
      fullResponse,
      error: entry.error,
    },
  };
}

// ── Store ────────────────────────────────────────────────────

interface SubagentState {
  /** Lightweight entries keyed by run ID. Large text lives in outputs. */
  entries: Record<string, SubagentEntry>;
  /** Live/final text keyed by run ID so broad entry subscribers don't rerender. */
  outputs: Record<string, SubagentOutputState>;
  /** Currently active workspace (for filtering). */
  activeWorkspaceId: string | null;
  /** Whether initial hydration has completed. */
  hydrated: boolean;

  /** Hydrate from a snapshot (mount-time + workspace change). */
  hydrate(workspaceId: string): Promise<void>;

  /** Abort a specific subagent. */
  abort(subagentId: string): Promise<void>;

  /** Remove all finished entries for a workspace. */
  clearCompleted(workspaceId: string): void;

  /** Initialize IPC event listeners. Returns cleanup function. */
  initListeners(): () => void;
}

/** How many views are asking for the store, so the listeners start once. */
let storeRefs = 0;
let listeningFor: string | null = null;
let stopListening: (() => void) | null = null;

/**
 * Hydrate the store and start listening, once per workspace while a view asks.
 *
 * The chat's live blocks are why the store exists now: the Explorer panel that
 * used to start it is gone, and a chat with no running `subagent` call must not
 * keep an IPC listener open.
 */
export function useEnsureSubagentStore(workspaceId: string | null): void {
  useEffect(() => {
    if (!workspaceId) return;
    storeRefs += 1;
    if (listeningFor !== workspaceId || !stopListening) {
      stopListening?.();
      listeningFor = workspaceId;
      stopListening = useSubagentStore.getState().initListeners();
      void useSubagentStore.getState().hydrate(workspaceId);
    }
    return () => {
      storeRefs -= 1;
      if (storeRefs > 0) return;
      stopListening?.();
      stopListening = null;
      listeningFor = null;
    };
  }, [workspaceId]);
}

/**
 * The runs one `subagent` tool call started, oldest first.
 *
 * Matched by the tool call id the run carries, so a parallel or chained call
 * shows exactly its own agents and never another call's.
 */
export function useSubagentRuns(toolCallId: string | undefined): SubagentEntry[] {
  const entries = useSubagentStore((state) => state.entries);
  return useMemo(() => {
    if (!toolCallId) return [];
    return Object.values(entries)
      .filter((entry) => entry.toolCallId === toolCallId)
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [entries, toolCallId]);
}

export const useSubagentStore = create<SubagentState>((set) => ({
  entries: {},
  outputs: {},
  activeWorkspaceId: null,
  hydrated: false,

  async hydrate(workspaceId: string) {
    set({ activeWorkspaceId: workspaceId, hydrated: false });
    try {
      const snapshot = await window.sero.subagent.snapshot(workspaceId);
      const entries: Record<string, SubagentEntry> = {};
      const outputs: Record<string, SubagentOutputState> = {};
      for (const rawEntry of snapshot) {
        const { entry, output } = splitEntryOutput(rawEntry);
        entries[entry.id] = entry;
        outputs[entry.id] = output;
      }
      set({ entries, outputs, hydrated: true });
    } catch (err) {
      console.warn('[subagent-store] Hydration failed:', err);
      set({ hydrated: true });
    }
  },

  async abort(subagentId: string) {
    await window.sero.subagent.abort(subagentId);
  },

  clearCompleted(workspaceId: string) {
    // Remove from main process so re-hydration doesn't bring them back
    window.sero.subagent.clearCompleted(workspaceId);
    // Remove from local state
    set((state) => {
      const nextEntries: Record<string, SubagentEntry> = {};
      const nextOutputs: Record<string, SubagentOutputState> = {};
      for (const [id, entry] of Object.entries(state.entries)) {
        if (entry.workspaceId === workspaceId && TERMINAL_STATUSES.has(entry.status)) {
          continue; // drop it
        }
        nextEntries[id] = entry;
        const output = state.outputs[id];
        if (output) nextOutputs[id] = output;
      }
      return { entries: nextEntries, outputs: nextOutputs };
    });
  },

  initListeners() {
    const unsub = window.sero.subagent.onEvent((event: SubagentEvent) => {
      set((state) => {
        switch (event.type) {
          case 'subagent_start': {
            const { entry, output } = splitEntryOutput(event.entry);
            return {
              entries: { ...state.entries, [entry.id]: entry },
              outputs: { ...state.outputs, [entry.id]: output },
            };
          }

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
            const output = state.outputs[event.id] ?? { liveOutput: '' };
            return {
              outputs: {
                ...state.outputs,
                [event.id]: {
                  ...output,
                  liveOutput: event.text,
                },
              },
            };
          }

          case 'subagent_end': {
            const existing = state.entries[event.id];
            if (!existing) return state;
            const output = state.outputs[event.id] ?? { liveOutput: '' };
            return {
              entries: {
                ...state.entries,
                [event.id]: {
                  ...existing,
                  status: event.status,
                  error: preview(event.error),
                  usage: event.usage,
                  durationMs: event.durationMs,
                  completedAt: existing.startedAt + event.durationMs,
                  responsePreview: preview(event.response),
                  toolActivity: [],
                  liveOutput: '',
                },
              },
              outputs: {
                ...state.outputs,
                [event.id]: {
                  ...output,
                  fullResponse: event.response,
                  error: event.error,
                  liveOutput: '',
                },
              },
            };
          }

          case 'subagent_clear': {
            const nextEntries: Record<string, SubagentEntry> = {};
            const nextOutputs: Record<string, SubagentOutputState> = {};
            for (const [id, entry] of Object.entries(state.entries)) {
              if (entry.parentSessionId === event.parentSessionId) continue;
              nextEntries[id] = entry;
              const output = state.outputs[id];
              if (output) nextOutputs[id] = output;
            }
            return { entries: nextEntries, outputs: nextOutputs };
          }

          default:
            return state;
        }
      });
    });

    return unsub;
  },
}));
