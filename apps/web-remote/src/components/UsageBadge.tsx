/**
 * Usage badge — cost and tokens for the session on screen.
 *
 * Tapping it opens the totals for every session this token reaches.
 * Hover text is no use on a phone, so the detail lives in a popover.
 */

import { Coins } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { formatCost, formatTokens } from '@/lib/format-usage';
import { useUsageStore, selectSessionUsage } from '@/stores/usage';
import { useWorkspaceStore } from '@/stores/workspace';

export function UsageBadge() {
  const report = useUsageStore((s) => s.report);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const usage = selectSessionUsage(report, activeSessionId);

  // Nothing was spent yet on this session, so there is nothing to show.
  if (!report || !usage) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="usage-badge"
          aria-label="Usage and cost"
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <Coins className="size-3 text-[var(--text-muted)]" />
          <span>{formatTokens(usage.totalTokens)}</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span>{formatCost(usage.costUsd)}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-3 text-xs">
        <p className="pb-2 text-sm font-medium text-[var(--text-primary)]">This session</p>
        <UsageRow label="Requests" value={`${usage.requests}`} />
        <UsageRow label="Input tokens" value={formatTokens(usage.inputTokens)} />
        <UsageRow label="Output tokens" value={formatTokens(usage.outputTokens)} />
        <UsageRow label="Cost" value={formatCost(usage.costUsd)} />

        <p className="pb-2 pt-3 text-sm font-medium text-[var(--text-primary)]">
          All sessions in reach
        </p>
        <UsageRow label="Sessions" value={`${report.sessions.length}`} />
        <UsageRow label="Tokens" value={formatTokens(report.totals.totalTokens)} />
        <UsageRow label="Cost" value={formatCost(report.totals.costUsd)} />

        <p className="pt-3 text-[var(--text-muted)]">
          Counted since the desktop app started. The daily total resets at UTC midnight.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
