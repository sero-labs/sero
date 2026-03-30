import { useEffect, useMemo, useState } from 'react';
import type { CollaborationRole } from '@/types/collaboration';
import type { SubagentEntry, SubagentEvent } from '@/types/ipc';

interface CollaborationSubagentState {
  entries: SubagentEntry[];
  latestEntryByRole: Map<CollaborationRole, SubagentEntry>;
}

function agentNameToRole(name: string): CollaborationRole | null {
  if (name === 'collab-analyst' || name === 'analyst') return 'analyst';
  if (name === 'researcher' || name === 'collab-researcher') return 'researcher';
  if (name === 'visionary' || name === 'collab-visionary') return 'visionary';
  if (name === 'coordinator' || name === 'collab-coordinator') return 'coordinator';
  return null;
}

function sortEntries(entries: SubagentEntry[]): SubagentEntry[] {
  return [...entries].sort((a, b) => a.startedAt - b.startedAt);
}

function rankEntry(entry: SubagentEntry): number {
  if (entry.status === 'running') return 3;
  if (entry.status === 'queued') return 2;
  return 1;
}

function reduceSubagentEvent(
  entries: Record<string, SubagentEntry>,
  event: SubagentEvent,
  sessionId: string,
): Record<string, SubagentEntry> {
  switch (event.type) {
    case 'subagent_start':
      if (event.entry.parentSessionId !== sessionId) return entries;
      return { ...entries, [event.entry.id]: event.entry };

    case 'subagent_progress': {
      const existing = entries[event.id];
      if (!existing) return entries;
      return {
        ...entries,
        [event.id]: {
          ...existing,
          usage: { ...existing.usage, ...event.usage },
        },
      };
    }

    case 'subagent_tool_activity': {
      const existing = entries[event.id];
      if (!existing) return entries;
      return {
        ...entries,
        [event.id]: {
          ...existing,
          toolActivity: event.activity,
        },
      };
    }

    case 'subagent_live_output': {
      const existing = entries[event.id];
      if (!existing) return entries;
      return {
        ...entries,
        [event.id]: {
          ...existing,
          liveOutput: event.text,
        },
      };
    }

    case 'subagent_end': {
      const existing = entries[event.id];
      if (!existing) return entries;
      return {
        ...entries,
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
      };
    }

    case 'subagent_clear': {
      if (event.parentSessionId !== sessionId) return entries;
      return {};
    }
  }
}

export function useCollaborationSubagentEntries(
  sessionId: string | null,
  workspaceId: string | null,
): CollaborationSubagentState {
  const [entriesById, setEntriesById] = useState<Record<string, SubagentEntry>>({});

  useEffect(() => {
    if (!sessionId || !workspaceId) {
      setEntriesById({});
      return;
    }

    let cancelled = false;
    setEntriesById({});

    const unsubscribe = window.sero.subagent.onEvent((event) => {
      setEntriesById((entries) => reduceSubagentEvent(entries, event, sessionId));
    });

    window.sero.subagent
      .snapshot(workspaceId)
      .then((snapshot) => {
        if (cancelled) return;
        setEntriesById((entries) => {
          const next = { ...entries };
          for (const entry of snapshot) {
            if (entry.parentSessionId !== sessionId) continue;
            next[entry.id] = next[entry.id] ? { ...entry, ...next[entry.id] } : entry;
          }
          return next;
        });
      })
      .catch((err) => {
        console.warn('[collaboration] Failed to hydrate subagent activity:', err);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, workspaceId]);

  const entries = useMemo(
    () => sortEntries(Object.values(entriesById)),
    [entriesById],
  );

  const latestEntryByRole = useMemo(() => {
    const map = new Map<CollaborationRole, SubagentEntry>();
    const sorted = [...entries].sort((a, b) => {
      const rankDiff = rankEntry(b) - rankEntry(a);
      if (rankDiff !== 0) return rankDiff;
      return b.startedAt - a.startedAt;
    });

    for (const entry of sorted) {
      const role = agentNameToRole(entry.agentName);
      if (!role || map.has(role)) continue;
      map.set(role, entry);
    }

    return map;
  }, [entries]);

  return { entries, latestEntryByRole };
}
