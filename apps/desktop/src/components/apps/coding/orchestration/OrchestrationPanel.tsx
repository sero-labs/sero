/**
 * OrchestrationPanel — top-level container for subagent monitoring.
 *
 * Hydrates the store on mount and workspace change. Renders the
 * subagent list + summary bar, or an empty state placeholder.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { Network, X } from 'lucide-react';
import { useSubagentStore } from '@/stores/subagent';
import { SubagentList } from './SubagentList';
import { SubagentSummary } from './SubagentSummary';
import type { SubagentEntry } from '@/types/ipc';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted', 'timed_out']);

const STATUS_SORT_ORDER: Record<string, number> = {
  running: 0,
  queued: 1,
  completed: 2,
  failed: 3,
  aborted: 4,
  timed_out: 5,
};

function sortEntries(entries: SubagentEntry[]): SubagentEntry[] {
  return entries.sort((a, b) => {
    const statusDiff =
      (STATUS_SORT_ORDER[a.status] ?? 99) - (STATUS_SORT_ORDER[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return a.startedAt - b.startedAt;
  });
}

interface OrchestrationPanelProps {
  workspaceId: string;
}

export function OrchestrationPanel({ workspaceId }: OrchestrationPanelProps) {
  const hydrate = useSubagentStore((s) => s.hydrate);
  const hydrated = useSubagentStore((s) => s.hydrated);
  const initListeners = useSubagentStore((s) => s.initListeners);
  const clearCompleted = useSubagentStore((s) => s.clearCompleted);
  const entries = useSubagentStore((s) => s.entries);

  // Derive filtered + sorted entries — stable unless `entries` record changes
  const filtered = useMemo(
    () =>
      sortEntries(
        Object.values(entries).filter((e) => e.workspaceId === workspaceId),
      ),
    [entries, workspaceId],
  );

  const hasCompleted = useMemo(
    () => filtered.some((e) => TERMINAL_STATUSES.has(e.status)),
    [filtered],
  );

  const handleClearCompleted = useCallback(() => {
    clearCompleted(workspaceId);
  }, [clearCompleted, workspaceId]);

  // Hydrate on mount and workspace change
  useEffect(() => {
    hydrate(workspaceId);
  }, [workspaceId, hydrate]);

  // Subscribe to live events
  useEffect(() => {
    const unsub = initListeners();
    return unsub;
  }, [initListeners]);

  if (!hydrated) {
    return (
      <div className="flex h-full flex-col">
        <Header showClear={false} onClear={handleClearCompleted} />
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-[var(--text-muted)]">Loading…</span>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Header showClear={false} onClear={handleClearCompleted} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
          <Network className="size-8 text-[var(--text-muted)] opacity-40" />
          <span className="text-xs text-[var(--text-muted)]">No subagent activity</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header showClear={hasCompleted} onClear={handleClearCompleted} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <SubagentList entries={filtered} />
      </div>
      <SubagentSummary workspaceId={workspaceId} />
    </div>
  );
}

function Header({ showClear, onClear }: { showClear: boolean; onClear: () => void }) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between px-4">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Orchestration
      </span>
      {showClear && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          title="Clear completed runs"
        >
          <X className="size-3" />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
}
