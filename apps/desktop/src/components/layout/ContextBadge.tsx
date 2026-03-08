import { useEffect, useState, useCallback } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sero/ui/components/ui/popover';
import type { ContextUsageInfo } from '@/types/ipc';

interface ContextBadgeProps {
  sessionId: string;
}

/**
 * Compact badge showing context window usage %. Click for details + compact.
 * Auto-refreshes on agent turn completion.
 */
export function ContextBadge({ sessionId }: ContextBadgeProps) {
  const [usage, setUsage] = useState<ContextUsageInfo | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [compactInstructions, setCompactInstructions] = useState('');
  const [compactError, setCompactError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const result = await window.sero.agent.getContextUsage(sessionId);
      setUsage(result);
    } catch {
      // Ignore — session may have closed
    }
  }, [sessionId]);

  // Fetch on mount
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Re-fetch when agent turns complete or auto-compaction finishes
  useEffect(() => {
    const unsub = window.sero.agent.onEvent((event) => {
      if (event.sessionId === sessionId && event.type === 'agent_end') {
        setTimeout(fetchUsage, 300);
      }
    });
    return unsub;
  }, [sessionId, fetchUsage]);

  const handleCompact = async () => {
    setCompactError(null);
    setCompacting(true);
    try {
      const result = await window.sero.agent.compact(
        sessionId,
        compactInstructions.trim() || undefined,
      );
      if (!result.success) {
        setCompactError(result.error || 'Compaction failed');
      } else {
        setCompactInstructions('');
        // Refresh usage after compaction
        setTimeout(fetchUsage, 500);
      }
    } catch (err: any) {
      setCompactError(err?.message || 'Compaction failed');
    } finally {
      setCompacting(false);
    }
  };

  const percent = usage?.percent ?? 0;
  const healthColor =
    percent < 50
      ? 'text-emerald-600 dark:text-emerald-400'
      : percent < 80
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const barColor =
    percent < 50
      ? 'bg-emerald-500'
      : percent < 80
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          title="Context window usage"
        >
          <Gauge className="size-3.5" />
          <span className={`text-xs tabular-nums ${healthColor}`}>
            {usage ? `${Math.round(percent)}%` : '—'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="text-sm w-64 space-y-3 bg-[var(--bg-elevated)] p-3"
      >
        <div className="font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Context Usage
        </div>

        {usage ? (
          <>
            {/* Percentage + token count */}
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-light tabular-nums ${healthColor}`}>
                {percent.toFixed(1)}%
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {fmtTokens(usage.tokens)} / {fmtTokens(usage.contextWindow)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]">
              <div
                className={`h-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>

            {/* Compact section */}
            <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
              <label className="text-xs text-[var(--text-muted)]">
                Compact context
              </label>
              <input
                type="text"
                placeholder="Custom instructions (optional)"
                value={compactInstructions}
                onChange={(e) => setCompactInstructions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !compacting) handleCompact();
                }}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                disabled={compacting}
              />
              <button
                onClick={handleCompact}
                disabled={compacting}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                {compacting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Compacting…
                  </>
                ) : (
                  'Compact Now'
                )}
              </button>
              {compactError && (
                <p className="text-xs text-red-500">{compactError}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">No usage data available.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
