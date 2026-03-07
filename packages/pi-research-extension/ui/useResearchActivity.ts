/**
 * useResearchActivity — tracks live subagent activity for research agents.
 *
 * Subscribes to `window.sero.subagent` IPC events and matches entries to
 * research agents by checking if the taskPreview contains the agent name.
 * Returns a map of research-agent-name → subagent entry with tool activity.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ResearchAgent } from '../shared/types';

// ── Minimal types for the subagent IPC API ──────────────────
// These mirror the desktop types but are declared locally so the
// federated module doesn't depend on apps/desktop type paths.

interface ToolActivity {
  toolName: string;
  argsSummary: string;
  running: boolean;
}

interface SubagentEntry {
  id: string;
  agentName: string;
  taskPreview: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  workspaceId: string;
  toolActivity: ToolActivity[];
  liveOutput: string;
  error?: string;
}

interface SubagentEvent {
  type: string;
  id?: string;
  entry?: SubagentEntry;
  activity?: ToolActivity[];
  text?: string;
  status?: string;
  error?: string;
  durationMs?: number;
}

interface SubagentAPI {
  onEvent(cb: (event: SubagentEvent) => void): () => void;
  snapshot(workspaceId: string): Promise<SubagentEntry[]>;
}

function getSubagentApi(): SubagentAPI | null {
  try {
    const sero = (window as unknown as { sero?: { subagent?: SubagentAPI } }).sero;
    return sero?.subagent ?? null;
  } catch {
    return null;
  }
}

// ── Exported types ──────────────────────────────────────────

export interface AgentActivity {
  subagentId: string;
  status: string;
  startedAt: number;
  tools: ToolActivity[];
  liveOutput: string;
  error?: string;
}

// ── Hook ────────────────────────────────────────────────────

/**
 * Track live subagent activity for a set of research agents.
 *
 * @param agents - research session agents (from state)
 * @param workspaceId - current workspace ID for filtering
 * @returns Map of agent name → activity (only for matched agents)
 */
export function useResearchActivity(
  agents: ResearchAgent[],
  workspaceId: string,
): Map<string, AgentActivity> {
  const [activity, setActivity] = useState<Map<string, AgentActivity>>(new Map());
  const entriesRef = useRef<Map<string, SubagentEntry>>(new Map());
  const agentNamesRef = useRef<string[]>([]);

  // Keep agent names in sync
  useEffect(() => {
    agentNamesRef.current = agents.map((a) => a.name);
  }, [agents]);

  // Match a subagent entry to a research agent by taskPreview content
  const matchAgent = useCallback((entry: SubagentEntry): string | null => {
    for (const name of agentNamesRef.current) {
      if (entry.taskPreview.includes(name)) return name;
    }
    return null;
  }, []);

  // Rebuild the activity map from current entries
  const rebuild = useCallback(() => {
    const next = new Map<string, AgentActivity>();
    for (const entry of entriesRef.current.values()) {
      const name = matchAgent(entry);
      if (name) {
        next.set(name, {
          subagentId: entry.id,
          status: entry.status,
          startedAt: entry.startedAt,
          tools: entry.toolActivity,
          liveOutput: entry.liveOutput,
          error: entry.error,
        });
      }
    }
    setActivity(next);
  }, [matchAgent]);

  // Hydrate from snapshot + subscribe to live events
  useEffect(() => {
    const api = getSubagentApi();
    if (!api || !workspaceId) return;

    // Snapshot hydration
    api.snapshot(workspaceId).then((entries) => {
      for (const e of entries) {
        entriesRef.current.set(e.id, e);
      }
      rebuild();
    });

    // Live event subscription
    const unsub = api.onEvent((event: SubagentEvent) => {
      switch (event.type) {
        case 'subagent_start':
          if (event.entry && event.entry.workspaceId === workspaceId) {
            entriesRef.current.set(event.entry.id, event.entry);
            rebuild();
          }
          break;

        case 'subagent_tool_activity':
          if (event.id && event.activity) {
            const existing = entriesRef.current.get(event.id);
            if (existing) {
              existing.toolActivity = event.activity;
              rebuild();
            }
          }
          break;

        case 'subagent_live_output':
          if (event.id && typeof event.text === 'string') {
            const existing = entriesRef.current.get(event.id);
            if (existing) {
              existing.liveOutput = event.text;
              rebuild();
            }
          }
          break;

        case 'subagent_end':
          if (event.id) {
            const existing = entriesRef.current.get(event.id);
            if (existing) {
              existing.status = event.status ?? 'completed';
              existing.error = event.error;
              existing.toolActivity = [];
              existing.liveOutput = '';
              rebuild();
            }
          }
          break;

        case 'subagent_clear':
          entriesRef.current.clear();
          rebuild();
          break;
      }
    });

    return () => {
      unsub();
      entriesRef.current.clear();
    };
  }, [workspaceId, rebuild]);

  return activity;
}
