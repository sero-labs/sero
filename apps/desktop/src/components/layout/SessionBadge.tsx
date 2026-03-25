import { useEffect, useState, useCallback } from 'react';
import { Gauge, Coins, Loader2, GitFork, Trash2, Check } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sero-ai/ui/components/ui/popover';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import type { SessionUsageStats, ContextUsageInfo } from '@/types/ipc';

interface SessionBadgeProps {
  sessionId: string;
}

/**
 * Combined badge showing context % and cost. Click to see full details
 * (context usage, token breakdown, compact/fork/clear actions).
 */
export function SessionBadge({ sessionId }: SessionBadgeProps) {
  const [usage, setUsage] = useState<ContextUsageInfo | null>(null);
  const [stats, setStats] = useState<SessionUsageStats | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [compactInstructions, setCompactInstructions] = useState('');
  const [forking, setForking] = useState(false);
  const [forkSuccess, setForkSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  // True once the store has messages for this session — signals the main-process
  // pool entry exists (open() resolved), so IPC calls will return real data.
  const sessionLoaded = useAgentStore(
    (s) => (s.agents[sessionId]?.messages?.length ?? 0) > 0,
  );

  const fetchAll = useCallback(async () => {
    try {
      const [ctx, usg] = await Promise.all([
        window.sero.agent.getContextUsage(sessionId),
        window.sero.agent.getUsage(sessionId),
      ]);
      setUsage(ctx);
      setStats(usg);
    } catch {
      // Ignore — session may have closed
    }
  }, [sessionId]);

  // Fetch on mount AND re-fetch when session messages are loaded. The initial
  // mount fetch may race with pool creation (returns null/zeros); once
  // sessionLoaded flips to true the pool entry is guaranteed to exist.
  useEffect(() => { fetchAll(); }, [fetchAll, sessionLoaded]);

  useEffect(() => {
    const unsub = window.sero.agent.onEvent((event) => {
      if (event.sessionId !== sessionId) return;
      // Update on message completion (per-message stats) and turn end
      if (event.type === 'message_end' || event.type === 'agent_end') {
        setTimeout(fetchAll, 300);
      }
    });
    return unsub;
  }, [sessionId, fetchAll]);

  // ── Actions ──────────────────────────────────────────────────
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
        setTimeout(fetchAll, 500);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Compaction failed');
    } finally {
      setCompacting(false);
    }
  };

  const handleFork = async () => {
    setActionError(null);
    setForkSuccess(false);
    setForking(true);
    try {
      await window.sero.agent.forkSession(sessionId);
      await loadSessions();
      setForkSuccess(true);
      setTimeout(() => setForkSuccess(false), 2000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Fork failed');
    } finally {
      setForking(false);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setActionError(null);
    setConfirmClear(false);
    setClearing(true);
    try {
      await window.sero.agent.clearSession(sessionId);
      setTimeout(fetchAll, 300);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  };

  // ── Derived values ───────────────────────────────────────────
  const percent = usage?.percent ?? null;
  const hasContextData = usage !== null && percent !== null;
  const cost = stats?.cost ?? 0;
  const t = stats?.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  const requestCount = stats?.requestCount ?? 0;

  const healthColor = !hasContextData
    ? 'text-[var(--text-muted)]'
    : percent < 50
      ? 'text-[var(--status-success)]'
      : percent < 80
        ? 'text-[var(--status-warning)]'
        : 'text-[var(--status-error)]';

  const barColor = !hasContextData
    ? 'bg-[var(--text-muted)]'
    : percent < 50
      ? 'bg-[var(--status-success)]'
      : percent < 80
        ? 'bg-[var(--status-warning)]'
        : 'bg-[var(--status-error)]';

  const busy = compacting || clearing || forking;

  return (
    <Popover onOpenChange={() => { setConfirmClear(false); setForkSuccess(false); setActionError(null); }}>
      <PopoverTrigger asChild>
        <button
          className="ml-auto flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          title="Session info"
        >
          <Gauge className="size-3.5" />
          <span className={`text-sm tabular-nums ${healthColor}`}>
            {hasContextData ? `${Math.round(percent)}%` : '—'}
          </span>
          <span className="text-[var(--text-muted)]">·</span>
          <Coins className="size-3.5" />
          <span className="text-sm tabular-nums text-[var(--status-success)]">
            {fmtCost(cost)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="text-sm w-64 space-y-3 bg-[var(--bg-elevated)] p-3"
      >
        {/* ── Context section ──────────────────────────────── */}
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Context Usage
        </div>

        {hasContextData && usage ? (
          <ContextSection
            usage={usage}
            percent={percent}
            healthColor={healthColor}
            barColor={barColor}
          />
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            {usage ? 'Recalculating after compaction…' : 'No usage data available.'}
          </p>
        )}

        {/* ── Usage / cost section ─────────────────────────── */}
        <div className="border-t border-[var(--border-subtle)] pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Token Usage
          </div>
          <div className="space-y-1">
            <Row label="Requests" value={requestCount.toLocaleString()} />
            <Row label="Total tokens" value={fmtTokens(t.total)} />
            <Row label="Input" value={fmtTokens(t.input)} muted />
            <Row label="Output" value={fmtTokens(t.output)} muted />
            {t.cacheRead > 0 && <Row label="Cache read" value={fmtTokens(t.cacheRead)} muted />}
            {t.cacheWrite > 0 && <Row label="Cache write" value={fmtTokens(t.cacheWrite)} muted />}
          </div>
          <div className="border-t border-[var(--border-subtle)] mt-2 pt-1.5">
            <Row label="Total cost" value={fmtCost(cost)} highlight />
          </div>
        </div>

        {/* ── Compact context ──────────────────────────────── */}
        <CompactSection
          compactInstructions={compactInstructions}
          onInstructionsChange={setCompactInstructions}
          onCompact={handleCompact}
          compacting={compacting}
          busy={busy}
        />

        {/* ── Session actions ──────────────────────────────── */}
        <SessionActions
          onFork={handleFork}
          onClear={handleClear}
          forking={forking}
          forkSuccess={forkSuccess}
          clearing={clearing}
          confirmClear={confirmClear}
          busy={busy}
        />

        {actionError && <p className="text-xs text-[var(--status-error)]">{actionError}</p>}
      </PopoverContent>
    </Popover>
  );
}

// ── Sub-components ─────────────────────────────────────────────

interface ContextSectionProps {
  usage: ContextUsageInfo;
  percent: number;
  healthColor: string;
  barColor: string;
}

function ContextSection({ usage, percent, healthColor, barColor }: ContextSectionProps) {
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
    </>
  );
}

interface CompactSectionProps {
  compactInstructions: string;
  onInstructionsChange: (v: string) => void;
  onCompact: () => void;
  compacting: boolean;
  busy: boolean;
}

function CompactSection({
  compactInstructions, onInstructionsChange, onCompact,
  compacting, busy,
}: CompactSectionProps) {
  return (
    <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
        Session
      </div>
      <input
        id="compact-instructions"
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
        className="flex w-full items-center justify-center gap-1.5 rounded bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-50"
      >
        {compacting ? (
          <><Loader2 className="size-3 animate-spin" /> Compacting…</>
        ) : (
          'Compact Now'
        )}
      </button>
    </div>
  );
}

interface SessionActionsProps {
  onFork: () => void;
  onClear: () => void;
  forking: boolean;
  forkSuccess: boolean;
  clearing: boolean;
  confirmClear: boolean;
  busy: boolean;
}

function SessionActions({ onFork, onClear, forking, forkSuccess, clearing, confirmClear, busy }: SessionActionsProps) {
  return (
    <div className="border-t border-[var(--border-subtle)] pt-2 flex gap-2">
      <button
        onClick={onFork}
        disabled={busy || forkSuccess}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${forkSuccess
            ? 'bg-[var(--status-success-subtle)] text-[var(--status-success)]'
            : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          }`}
        title="Fork: copy conversation to a new session"
      >
        {forking ? <Loader2 className="size-3 animate-spin" /> : forkSuccess ? <Check className="size-3" /> : <GitFork className="size-3" />}
        {forkSuccess ? 'Forked!' : 'Fork'}
      </button>
      <button
        onClick={onClear}
        disabled={busy}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${confirmClear
            ? 'bg-[var(--status-error-border)] text-[var(--status-error)]'
            : 'bg-[var(--bg-surface)] text-[var(--status-error)] hover:bg-[var(--status-error-muted)]'
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

function Row({
  label, value, muted, highlight,
}: {
  label: string; value: string; muted?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'pl-2 text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}>
        {label}
      </span>
      <span className={highlight ? 'font-medium text-[var(--text-primary)]' : 'tabular-nums text-[var(--text-secondary)]'}>
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
