/**
 * SubagentSummary, aggregate stats bar at the bottom of the
 * orchestration panel.
 *
 * Format: "4 runs · $0.08 · 8.3k tokens · 90s"
 */

import { useMemo } from 'react';
import { useSubagentStore } from '@/stores/subagent';

interface SubagentSummaryProps {
  workspaceId: string;
}

function formatTokens(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function formatDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function SubagentSummary({ workspaceId }: SubagentSummaryProps) {
  const entries = useSubagentStore((s) => s.entries);

  const summary = useMemo(() => {
    let count = 0;
    let totalCost = 0;
    let totalTokens = 0;
    let totalDurationMs = 0;

    for (const e of Object.values(entries)) {
      if (e.workspaceId !== workspaceId) continue;
      count++;
      totalCost += e.usage.cost;
      totalTokens += e.usage.totalTokens;
      totalDurationMs += e.durationMs ?? 0;
    }

    return { count, totalCost, totalTokens, totalDurationMs };
  }, [entries, workspaceId]);

  if (summary.count === 0) return null;

  const parts = [
    `${summary.count} run${summary.count !== 1 ? 's' : ''}`,
    formatCost(summary.totalCost),
    `${formatTokens(summary.totalTokens)} tokens`,
    formatDuration(summary.totalDurationMs),
  ];

  return (
    <div className="shrink-0 border-t border-[var(--border-subtle)] px-3 py-1.5">
      <span className="text-sm text-[var(--text-muted)]">
        {parts.join(' · ')}
      </span>
    </div>
  );
}
