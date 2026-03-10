/**
 * SubagentCard — individual subagent run card with live tool activity,
 * ticking timer, token/cost stats, and expandable output.
 *
 * Matches the rounded-border card style from ToolCallGroup.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronRight, Loader2, CheckCircle2, XCircle, AlertCircle, Clock, Square } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import type { SubagentEntry, SubagentToolActivity } from '@/types/ipc';
import { useSubagentStore } from '@/stores/subagent';
import { SubagentOutput } from './SubagentOutput';

interface SubagentCardProps {
  entry: SubagentEntry;
}

// ── Status helpers ──────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
    case 'queued':
      return <Loader2 className="size-3.5 animate-spin text-[var(--status-info)]" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-[var(--status-success)]" />;
    case 'failed':
    case 'timed_out':
      return <XCircle className="size-3.5 text-[var(--status-error)]" />;
    case 'aborted':
      return <AlertCircle className="size-3.5 text-[var(--status-warning)]" />;
    default:
      return <Clock className="size-3.5 text-[var(--text-muted)]" />;
  }
}

function formatDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function formatTokens(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

// ── Tool activity icon ──────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📖', bash: '📂', write: '✏️', edit: '✏️',
  ls: '📁', find: '🔍', grep: '🔎',
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

// ── Tool Activity Feed ──────────────────────────────────────

function ToolActivityFeed({ activity }: { activity: SubagentToolActivity[] }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activity]);

  if (activity.length === 0) return null;

  return (
    <div
      ref={feedRef}
      className="mt-1.5 max-h-28 overflow-y-auto border-t border-[var(--border-subtle)]/40 pt-1"
    >
      {activity.map((item, i) => (
        <div
          key={`${item.toolName}-${i}`}
          className="flex items-center gap-1.5 px-0.5 py-[1px]"
        >
          {item.running ? (
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--status-info)]" />
          ) : (
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-success)]" />
          )}
          <span className="shrink-0 text-[10px]">{toolIcon(item.toolName)}</span>
          <span className="shrink-0 text-[10px] font-medium text-[var(--text-muted)]">
            {item.toolName}
          </span>
          {item.argsSummary && (
            <span className="min-w-0 truncate text-[10px] text-[var(--text-secondary)]/70">
              {item.argsSummary}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Live Output Preview ─────────────────────────────────────

function LiveOutputPreview({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [text]);

  if (!text) return null;

  // Show last ~500 chars for a live preview
  const preview = text.length > 500 ? '…' + text.slice(-500) : text;

  return (
    <pre
      ref={ref}
      className="mt-1 max-h-32 overflow-y-auto rounded bg-[var(--bg-base)] p-1.5 text-[10px] leading-relaxed text-[var(--text-secondary)]/80 whitespace-pre-wrap break-words"
    >
      {preview}
      <span className="animate-pulse text-[var(--status-info)]">█</span>
    </pre>
  );
}

// ── Main Card ───────────────────────────────────────────────

/** Threshold (ms) after which a running card shows a "may be stalled" hint. */
const STALL_HINT_MS = 90_000;

export function SubagentCard({ entry }: SubagentCardProps) {
  const isRunning = entry.status === 'running' || entry.status === 'queued';
  const isFailed = entry.status === 'failed' || entry.status === 'timed_out';
  const isAborted = entry.status === 'aborted';
  const abort = useSubagentStore((s) => s.abort);

  // Ticking elapsed timer
  const [elapsed, setElapsed] = useState(entry.durationMs ?? 0);
  useEffect(() => {
    if (!isRunning) {
      setElapsed(entry.durationMs ?? 0);
      return;
    }
    const tick = () => setElapsed(Date.now() - entry.startedAt);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning, entry.startedAt, entry.durationMs]);

  // Stall hint: show when running and a tool has been active for a while
  const mayBeStalled = isRunning
    && elapsed > STALL_HINT_MS
    && entry.toolActivity.some((t) => t.running);

  const handleAbort = useCallback(() => {
    abort(entry.id);
  }, [abort, entry.id]);

  // Expand/collapse state
  const [expanded, setExpanded] = useState(false);
  const [showLiveOutput, setShowLiveOutput] = useState(false);
  const hasOutput = !!(entry.fullResponse || entry.error);
  const hasLiveOutput = isRunning && entry.liveOutput.length > 0;

  // Border color based on status
  const borderClass = isRunning
    ? 'border-[var(--status-info-border)] bg-[var(--status-info-faint)]'
    : isFailed
      ? 'border-[var(--status-error-border)] bg-[var(--status-error-faint)]'
      : isAborted
        ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-faint)]'
        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50';

  return (
    <div className={cn('overflow-hidden rounded-lg border transition-colors duration-200', borderClass)}>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusIcon status={entry.status} />
        <span className="font-medium text-xs text-[var(--text-primary)] truncate">
          {entry.agentName}
        </span>
        {entry.chainStep !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)]">
            [Step {entry.chainStep + 1}]
          </span>
        )}
        <div className="flex-1" />
        {/* Stats inline */}
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          {entry.model && (
            <span className="hidden sm:inline">{entry.model}</span>
          )}
          <span>{formatDuration(elapsed)}</span>
          {entry.usage.totalTokens > 0 && (
            <span>{formatTokens(entry.usage.totalTokens)}</span>
          )}
          {entry.usage.cost > 0 && (
            <span className="text-[var(--status-success)]">{formatCost(entry.usage.cost)}</span>
          )}
        </div>
        {/* Stop button (running only) */}
        {isRunning && (
          <button
            onClick={handleAbort}
            className={cn(
              'ml-1 flex items-center justify-center rounded p-1 transition-colors',
              mayBeStalled
                ? 'bg-[var(--status-error-border)] text-[var(--status-error)] hover:bg-[var(--status-error-subtle)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--status-error)]',
            )}
            title={mayBeStalled ? 'Stop — tool appears stalled' : 'Stop subagent'}
          >
            <Square className="size-3 fill-current" />
          </button>
        )}
      </div>

      {/* ── Task preview ───────────────────────────────── */}
      <p className="px-3 pb-1 text-[11px] text-[var(--text-muted)] truncate leading-tight">
        {entry.taskPreview}
      </p>

      {/* ── Live tool activity feed (running only) ──── */}
      {isRunning && entry.toolActivity.length > 0 && (
        <div className="px-3 pb-1">
          <ToolActivityFeed activity={entry.toolActivity} />
        </div>
      )}

      {/* ── Stall warning ──────────────────────────────── */}
      {mayBeStalled && (
        <div className="flex items-center gap-1.5 border-t border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] px-3 py-1">
          <AlertCircle className="size-3 shrink-0 text-[var(--status-warning)]" />
          <span className="text-[10px] text-[var(--status-warning)]">
            Tool may be stalled — stop or wait for auto-timeout
          </span>
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-t border-[var(--border-subtle)]/40 px-3 py-1">
        {/* Live output toggle (running) */}
        {hasLiveOutput && (
          <button
            onClick={() => setShowLiveOutput(!showLiveOutput)}
            className="text-[10px] text-[var(--status-info)] hover:text-[var(--status-info)] transition-colors"
          >
            {showLiveOutput ? '▲ Hide live' : '▼ Live output'}
          </button>
        )}

        {/* Final output toggle (completed) */}
        {hasOutput && !isRunning && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {expanded ? '▲ Hide' : isFailed ? '▼ Error' : '▼ Output'}
          </button>
        )}
      </div>

      {/* ── Live output preview (running) ──────────────── */}
      {showLiveOutput && hasLiveOutput && (
        <div className="px-3 pb-2">
          <LiveOutputPreview text={entry.liveOutput} />
        </div>
      )}

      {/* ── Final output (completed/failed) ────────────── */}
      {expanded && hasOutput && (
        <div className="px-3 pb-2">
          <SubagentOutput
            response={entry.fullResponse}
            error={entry.error}
            isFailed={isFailed}
          />
        </div>
      )}
    </div>
  );
}
