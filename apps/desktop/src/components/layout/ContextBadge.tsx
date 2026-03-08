import { useEffect, useState, useCallback } from 'react';
import { Gauge, Loader2, GitFork, Trash2 } from 'lucide-react';
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
 * Compact badge showing context window usage %. Click for details + compact,
 * fork session, or clear session.
 * Auto-refreshes on agent turn completion and auto-compaction.
 */
export function ContextBadge({ sessionId }: ContextBadgeProps) {
  const [usage, setUsage] = useState<ContextUsageInfo | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [compactInstructions, setCompactInstructions] = useState('');
  const [forking, setForking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const result = await window.sero.agent.getContextUsage(sessionId);
      setUsage(result);
    } catch {
      // Ignore — session may have closed
    }
  }, [sessionId]);

  // Fetch on mount and when sessionId changes
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Re-fetch when agent turns complete (also fires after auto-compaction)
  useEffect(() => {
    const unsub = window.sero.agent.onEvent((event) => {
      if (event.sessionId !== sessionId) return;
      if (event.type === 'agent_end') {
        setTimeout(fetchUsage, 300);
      }
    });
    return unsub;
  }, [sessionId, fetchUsage]);

  const handleCompact = async () => {
    setActionError(null);
    setCompacting(true);
    try {
      const result = await window.sero.agent.compact(
        sessionId,
        compactInstructions.trim() || undefined,
      );
      if (!result.success) {
        setActionError(result.error || 'Compaction failed');
      } else {
        setCompactInstructions('');
        setTimeout(fetchUsage, 500);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Compaction failed');
    } finally {
      setCompacting(false);
    }
  };

  const handleFork = async () => {
    setActionError(null);
    setForking(true);
    try {
      await window.sero.agent.forkSession(sessionId);
      // Fork created — user can switch to it from the session list.
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Fork failed');
    } finally {
      setForking(false);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setActionError(null);
    setConfirmClear(false);
    setClearing(true);
    try {
      await window.sero.agent.clearSession(sessionId);
      setTimeout(fetchUsage, 300);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  };

  // tokens and percent may be null (e.g. right after compaction)
  const percent = usage?.percent ?? null;
  const hasData = usage !== null && percent !== null;

  const healthColor = !hasData
    ? 'text-[var(--text-muted)]'
    : percent < 50
      ? 'text-emerald-600 dark:text-emerald-400'
      : percent < 80
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const barColor = !hasData
    ? 'bg-[var(--text-muted)]'
    : percent < 50
      ? 'bg-emerald-500'
      : percent < 80
        ? 'bg-amber-500'
        : 'bg-red-500';

  const busy = compacting || clearing || forking;

  return (
    <Popover onOpenChange={() => { setConfirmClear(false); setActionError(null); }}>
      <PopoverTrigger asChild>
        <button
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          title="Context window usage"
        >
          <Gauge className="size-3.5" />
          <span className="text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
            {hasData ? `${Math.round(percent)}%` : '—'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="text-sm w-64 space-y-3 bg-[var(--bg-elevated)] p-3"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Context Usage
        </div>

        {hasData && usage ? (
          <ContextDetails
            usage={usage}
            percent={percent}
            healthColor={healthColor}
            barColor={barColor}
            compactInstructions={compactInstructions}
            onInstructionsChange={setCompactInstructions}
            onCompact={handleCompact}
            compacting={compacting}
            busy={busy}
          />
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            {usage ? 'Recalculating after compaction…' : 'No usage data available.'}
          </p>
        )}

        <SessionActions
          onFork={handleFork}
          onClear={handleClear}
          forking={forking}
          clearing={clearing}
          confirmClear={confirmClear}
          busy={busy}
        />

        {actionError && (
          <p className="text-xs text-red-500">{actionError}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Sub-components ─────────────────────────────────────────────

interface ContextDetailsProps {
  usage: ContextUsageInfo;
  percent: number;
  healthColor: string;
  barColor: string;
  compactInstructions: string;
  onInstructionsChange: (v: string) => void;
  onCompact: () => void;
  compacting: boolean;
  busy: boolean;
}

function ContextDetails({
  usage, percent, healthColor, barColor,
  compactInstructions, onInstructionsChange, onCompact,
  compacting, busy,
}: ContextDetailsProps) {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className={`text-lg font-light tabular-nums ${healthColor}`}>
          {percent.toFixed(1)}%
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {usage.tokens !== null ? fmtTokens(usage.tokens) : '?'} / {fmtTokens(usage.contextWindow)}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
        <label className="text-xs text-[var(--text-muted)]">Compact context</label>
        <input
          type="text"
          placeholder="Custom instructions (optional)"
          value={compactInstructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) onCompact(); }}
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          disabled={busy}
        />
        <button
          onClick={onCompact}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {compacting ? (
            <><Loader2 className="size-3 animate-spin" /> Compacting…</>
          ) : (
            'Compact Now'
          )}
        </button>
      </div>
    </>
  );
}

interface SessionActionsProps {
  onFork: () => void;
  onClear: () => void;
  forking: boolean;
  clearing: boolean;
  confirmClear: boolean;
  busy: boolean;
}

function SessionActions({ onFork, onClear, forking, clearing, confirmClear, busy }: SessionActionsProps) {
  return (
    <div className="border-t border-[var(--border-subtle)] pt-2 flex gap-2">
      <button
        onClick={onFork}
        disabled={busy}
        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        title="Fork: copy conversation to a new session"
      >
        {forking ? <Loader2 className="size-3 animate-spin" /> : <GitFork className="size-3" />}
        Fork
      </button>
      <button
        onClick={onClear}
        disabled={busy}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          confirmClear
            ? 'bg-red-500/20 text-red-600 dark:text-red-400'
            : 'bg-[var(--bg-surface)] text-red-600 dark:text-red-400 hover:bg-red-500/10'
        }`}
        title="Reset conversation (branch from root)"
      >
        {clearing ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        {confirmClear ? 'Confirm?' : 'Clear'}
      </button>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
