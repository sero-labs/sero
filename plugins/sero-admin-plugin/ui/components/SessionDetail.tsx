/**
 * SessionDetail, session message viewer.
 *
 * Reads the JSONL file directly via `readText` (no agent.open side
 * effects). Parses each line into a lightweight entry. Uses CSS
 * `content-visibility: auto` to skip layout/paint for off-screen
 * rows, not true virtualisation, but effective for most session sizes.
 */

import { useEffect, useMemo, useState, memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { getSero } from '../hooks/host';
import type { SessionFileInfo } from '../hooks/useSessionFiles';
import {
  formatMalformedLineSummary,
  parseSessionJsonl,
  type SessionMessageEntry,
} from '../lib/session-log';

// ── SessionDetail ──────────────────────────────────────────

interface SessionDetailProps {
  sessionId: string;
  sessions: SessionFileInfo[];
}

export const SessionDetail = memo(function SessionDetail({
  sessionId,
  sessions,
}: SessionDetailProps) {
  const [messages, setMessages] = useState<SessionMessageEntry[]>([]);
  const [malformedLines, setMalformedLines] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const session = sessions.find((candidate) => candidate.sessionId === sessionId) ?? null;
  const malformedSummary = useMemo(
    () => formatMalformedLineSummary(malformedLines),
    [malformedLines],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedIndex(null);
    setMessages([]);
    setMalformedLines([]);

    const load = async () => {
      if (!session) {
        if (!cancelled) {
          setError('Session not found');
          setLoading(false);
        }
        return;
      }

      try {
        const raw = await getSero().appState.readText(session.path);
        if (cancelled) {
          return;
        }

        if (!raw) {
          setError('Session file is empty or missing');
          return;
        }

        const parsed = parseSessionJsonl(raw);
        setMessages(parsed.entries);
        setMalformedLines(parsed.malformedLines);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading session…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-foreground/80">
            {sessionId.slice(0, 8)}...
          </span>
          {session ? (
            <span className="text-[10px] text-muted-foreground/50">
              {session.dateLabel}
            </span>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className="h-5 rounded-md border-primary/20 bg-primary/5 px-2 text-[10px] text-primary"
        >
          {messages.length} messages
        </Badge>
      </div>

      {malformedSummary ? (
        <div className="border-b border-amber-500/20 bg-amber-500/6 px-4 py-2">
          <p className="text-[11px] text-amber-300/90">
            {malformedSummary} The session file may be partially corrupted.
          </p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.map((message) => (
          <MessageRow
            key={message.index}
            message={message}
            isExpanded={message.index === expandedIndex}
            onToggle={() =>
              setExpandedIndex(expandedIndex === message.index ? null : message.index)
            }
          />
        ))}
      </div>

      {expandedIndex !== null && messages[expandedIndex] ? (
        <MessageDetailOverlay
          message={messages[expandedIndex]}
          onClose={() => setExpandedIndex(null)}
        />
      ) : null}
    </div>
  );
});

// ── Message row ────────────────────────────────────────────

const MessageRow = memo(function MessageRow({
  message,
  isExpanded,
  onToggle,
}: {
  message: SessionMessageEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button"
      onClick={onToggle}
      className={cn(
        'admin-message-card w-full flex gap-3 px-4 py-2 border-b border-border/20',
        'text-left transition-colors duration-150 hover:bg-secondary/30',
        isExpanded && 'bg-primary/5 border-primary/20',
      )}
    >
      <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground/30">
        {message.index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'h-4 shrink-0 rounded px-1.5 text-[9px] font-medium',
              getRoleColor(message.role),
            )}
          >
            {message.role}
          </Badge>
          {message.timestamp ? (
            <span className="text-[10px] text-muted-foreground/30">
              {message.timestamp}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-[1.5] text-foreground/70">
          {message.preview}
        </p>
      </div>
    </button>
  );
});

// ── Message detail overlay ─────────────────────────────────

const MessageDetailOverlay = memo(function MessageDetailOverlay({
  message,
  onClose,
}: {
  message: SessionMessageEntry;
  onClose: () => void;
}) {
  const jsonText = useMemo(
    () => JSON.stringify(message.raw, null, 2),
    [message.raw],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[700px] max-w-[90vw] flex-col rounded-xl border border-border/50 bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn('h-5 rounded px-2 text-[10px]', getRoleColor(message.role))}
            >
              {message.role}
            </Badge>
            <span className="font-mono text-[11px] text-muted-foreground/50">
              Message #{message.index + 1}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <pre className="admin-editor whitespace-pre-wrap break-all px-4 py-3 text-[11px] leading-[1.6] text-foreground/80">
            {jsonText}
          </pre>
        </div>
      </div>
    </div>
  );
});

// ── Helpers ────────────────────────────────────────────────

function getRoleColor(role: string): string {
  switch (role) {
    case 'user':
      return 'border-primary/30 bg-primary/5 text-primary';
    case 'assistant':
      return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400';
    case 'toolResult':
      return 'border-amber-500/30 bg-amber-500/5 text-amber-400';
    default:
      return 'border-muted-foreground/20 bg-muted/5 text-muted-foreground';
  }
}
