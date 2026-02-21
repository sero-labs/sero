import { useEffect, useState, useCallback } from 'react';
import { Coins } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sero/ui/components/ui/popover';
import type { SessionUsageStats } from '@/types/ipc';

interface UsageBadgeProps {
  sessionId: string;
}

/**
 * Compact badge showing session cost. Click to see full token breakdown.
 * Auto-refreshes when agent turns complete.
 */
export function UsageBadge({ sessionId }: UsageBadgeProps) {
  const [stats, setStats] = useState<SessionUsageStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const result = await window.sero.agent.getUsage(sessionId);
      setStats(result);
    } catch {
      // Ignore — session may have closed
    }
  }, [sessionId]);

  // Fetch on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Re-fetch when agent turns complete
  useEffect(() => {
    const unsub = window.sero.agent.onEvent((event) => {
      if (event.sessionId === sessionId && event.type === 'agent_end') {
        // Small delay to let session persist final usage
        setTimeout(fetchStats, 300);
      }
    });
    return unsub;
  }, [sessionId, fetchStats]);

  const t = stats?.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  const cost = stats?.cost ?? 0;
  const requestCount = stats?.requestCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          title="Token usage & cost"
        >
          <Coins className="size-4" />
          <span className='text-sm'>{fmtCost(cost)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="text-sm w-56 space-y-2 bg-[var(--bg-elevated)] p-3"
      >
        <div className="font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Session Usage
        </div>

        <div className="space-y-1">
          <Row label="Requests" value={requestCount.toLocaleString()} />
          <Row label="Total tokens" value={fmtTokens(t.total)} />
          <Row label="Input" value={fmtTokens(t.input)} muted />
          <Row label="Output" value={fmtTokens(t.output)} muted />
          {t.cacheRead > 0 && (
            <Row label="Cache read" value={fmtTokens(t.cacheRead)} muted />
          )}
          {t.cacheWrite > 0 && (
            <Row label="Cache write" value={fmtTokens(t.cacheWrite)} muted />
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)]" />

        <Row label="Total cost" value={fmtCost(cost)} highlight />
      </PopoverContent>
    </Popover>
  );
}

function Row({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between ">
      <span className={muted ? 'pl-2 text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}>
        {label}
      </span>
      <span
        className={
          highlight
            ? 'font-medium text-[var(--text-primary)]'
            : 'tabular-nums text-[var(--text-secondary)]'
        }
      >
        {value}
      </span>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
