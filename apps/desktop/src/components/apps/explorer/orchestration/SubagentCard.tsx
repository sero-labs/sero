/**
 * SubagentCard, individual subagent run card with live tool activity,
 * ticking timer, token/cost stats, and expandable output.
 *
 * Matches the rounded-border card style from ToolCallGroup.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Search,
  Square,
  Terminal,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
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
      return <Loader2 className="size-3.5 animate-spin text-status-info" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-status-success" />;
    case 'failed':
    case 'timed_out':
      return <XCircle className="size-3.5 text-status-error" />;
    case 'aborted':
      return <AlertCircle className="size-3.5 text-status-warning" />;
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

const TOOL_ICONS: Record<string, LucideIcon> = {
  read: FileText,
  bash: Terminal,
  write: Pencil,
  edit: Pencil,
  ls: FolderOpen,
  find: Search,
  grep: Search,
};

function ToolIcon({ name }: { name: string }) {
  const Icon = TOOL_ICONS[name] ?? Wrench;
  return <Icon className="size-3" />;
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
          title={item.argsSummary ? `${item.toolName} ${item.argsSummary}` : item.toolName}
        >
          {item.running ? (
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-status-info" />
          ) : (
            <span className="size-1.5 shrink-0 rounded-full bg-status-success" />
          )}
          <span className="shrink-0 text-sm"><ToolIcon name={item.toolName} /></span>
          <span className="shrink-0 text-sm font-medium text-[var(--text-muted)]">
            {item.toolName}
          </span>
          {item.argsSummary && (
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]/70">
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
  const preview = text.length > 500 ? '...' + text.slice(-500) : text;

  return (
    <pre
      ref={ref}
      className="mt-1 max-h-32 overflow-y-auto rounded bg-[var(--bg-base)] p-1.5 text-sm leading-relaxed text-[var(--text-secondary)]/80 whitespace-pre-wrap break-words"
    >
      {preview}
      <span className="animate-pulse text-status-info">█</span>
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
  const output = useSubagentStore((s) => s.outputs[entry.id]);

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
  const liveOutput = output?.liveOutput ?? '';
  const fullResponse = output?.fullResponse;
  const outputError = output?.error ?? entry.error;
  const hasOutput = !!(fullResponse || outputError);
  const hasLiveOutput = isRunning && liveOutput.length > 0;

  // Border color based on status
  const borderClass = isRunning
    ? 'border-status-info-border bg-status-info-faint'
    : isFailed
      ? 'border-status-error-border bg-status-error-faint'
      : isAborted
        ? 'border-status-warning-border bg-status-warning-faint'
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
          <span className="text-sm text-[var(--text-muted)]">
            [Step {entry.chainStep + 1}]
          </span>
        )}
        <div className="flex-1" />
        {/* Stats inline */}
        <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
          {entry.model && (
            <span className="hidden sm:inline">{entry.model}</span>
          )}
          <span>{formatDuration(elapsed)}</span>
          {entry.usage.totalTokens > 0 && (
            <span>{formatTokens(entry.usage.totalTokens)}</span>
          )}
          {entry.usage.cost > 0 && (
            <span className="text-status-success">{formatCost(entry.usage.cost)}</span>
          )}
        </div>
        {/* Stop button (running only) */}
        {isRunning && (
          <button type="button"
            onClick={handleAbort}
            className={cn(
              'ml-1 flex items-center justify-center rounded p-1 transition-colors',
              mayBeStalled
                ? 'bg-status-error-border text-status-error hover:bg-status-error-subtle'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-status-error',
            )}
            title={mayBeStalled ? 'Stop, tool appears stalled' : 'Stop subagent'}
          >
            <Square className="size-3 fill-current" />
          </button>
        )}
      </div>

      {/* ── Task preview ───────────────────────────────── */}
      <p className="px-3 pb-1 text-sm text-[var(--text-muted)] truncate leading-tight">
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
        <div className="flex items-center gap-1.5 border-t border-status-warning-border bg-status-warning-faint px-3 py-1">
          <AlertCircle className="size-3 shrink-0 text-status-warning" />
          <span className="text-sm text-status-warning">
            Tool may be stalled, stop or wait for auto-timeout
          </span>
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-t border-[var(--border-subtle)]/40 px-3 py-1">
        {/* Live output toggle (running) */}
        {hasLiveOutput && (
          <button type="button"
            onClick={() => setShowLiveOutput(!showLiveOutput)}
            className="text-sm text-status-info hover:brightness-125 transition-colors"
          >
            {showLiveOutput ? '▲ Hide live' : '▼ Live output'}
          </button>
        )}

        {/* Final output toggle (completed) */}
        {hasOutput && !isRunning && (
          <button type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {expanded ? '▲ Hide' : isFailed ? '▼ Error' : '▼ Output'}
          </button>
        )}
      </div>

      {/* ── Live output preview (running) ──────────────── */}
      {showLiveOutput && hasLiveOutput && (
        <div className="px-3 pb-2">
          <LiveOutputPreview text={liveOutput} />
        </div>
      )}

      {/* ── Final output (completed/failed) ────────────── */}
      {expanded && hasOutput && (
        <div className="px-3 pb-2">
          <SubagentOutput
            response={fullResponse}
            error={outputError}
            isFailed={isFailed}
          />
        </div>
      )}
    </div>
  );
}
