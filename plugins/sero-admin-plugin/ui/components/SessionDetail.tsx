/**
 * SessionDetail — session message viewer.
 *
 * Reads the JSONL file directly via `readText` (no agent.open side
 * effects). Parses each line into a lightweight entry. Uses CSS
 * `content-visibility: auto` to skip layout/paint for off-screen
 * rows — not true virtualisation, but effective for most session sizes.
 */

import { useState, useEffect, useMemo, memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { getSero } from '../hooks/useSeroFiles';
import type { SessionFileInfo } from '../hooks/useSeroFiles';
import { formatTime } from '../lib/format';

// ── Types ──────────────────────────────────────────────────

interface MessageEntry {
  index: number;
  role: string;
  preview: string;
  timestamp: string;
  raw: Record<string, unknown>;
}

// ── SessionDetail ──────────────────────────────────────────

interface SessionDetailProps {
  sessionId: string;
  sessions: SessionFileInfo[];
}

export const SessionDetail = memo(function SessionDetail({
  sessionId,
  sessions,
}: SessionDetailProps) {
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const session = sessions.find((s) => s.sessionId === sessionId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedIndex(null);
    setMessages([]);

    const load = async () => {
      try {
        const sero = getSero();
        const allSessions = await sero.sessions.list();
        const target = allSessions.find((s) => s.id === sessionId);
        if (!target) {
          if (!cancelled) setError('Session not found');
          return;
        }

        const raw = await sero.appState.readText(target.path);
        if (cancelled) return;

        if (!raw) {
          setError('Session file is empty or missing');
          return;
        }

        setMessages(parseJsonlToEntries(raw));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-foreground/80">
            {sessionId.slice(0, 8)}…
          </span>
          {session && (
            <span className="text-[10px] text-muted-foreground/50">
              {session.dateLabel}
            </span>
          )}
        </div>
        <Badge
          variant="outline"
          className="h-5 rounded-md border-primary/20 bg-primary/5 px-2 text-[10px] text-primary"
        >
          {messages.length} messages
        </Badge>
      </div>

      {/* Message list — CSS content-visibility for off-screen skip */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.map((msg) => (
          <MessageRow
            key={msg.index}
            message={msg}
            isExpanded={msg.index === expandedIndex}
            onToggle={() =>
              setExpandedIndex(expandedIndex === msg.index ? null : msg.index)
            }
          />
        ))}
      </div>

      {/* Expanded detail overlay */}
      {expandedIndex !== null && messages[expandedIndex] && (
        <MessageDetailOverlay
          message={messages[expandedIndex]}
          onClose={() => setExpandedIndex(null)}
        />
      )}
    </div>
  );
});

// ── Message row ────────────────────────────────────────────

const MessageRow = memo(function MessageRow({
  message,
  isExpanded,
  onToggle,
}: {
  message: MessageEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
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
          {message.timestamp && (
            <span className="text-[10px] text-muted-foreground/30">
              {message.timestamp}
            </span>
          )}
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
  message: MessageEntry;
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
        onClick={(e) => e.stopPropagation()}
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
            ✕
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

/** Parse a JSONL string into lightweight message entries. */
function parseJsonlToEntries(raw: string): MessageEntry[] {
  const lines = raw.split('\n').filter((l) => l.trim());
  const entries: MessageEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const data = JSON.parse(lines[i]) as Record<string, unknown>;
      const msg = data.message as Record<string, unknown> | undefined;
      const role = (msg?.role as string) || (data.type as string) || 'unknown';
      const ts = (data.timestamp as string) || (msg?.timestamp as string) || '';

      entries.push({
        index: i,
        role,
        preview: extractPreview(data),
        timestamp: ts ? formatTime(ts) : '',
        raw: data,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

function extractPreview(data: Record<string, unknown>): string {
  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return JSON.stringify(data).slice(0, 300);

  const content = msg.content;
  if (typeof content === 'string') return content.slice(0, 500);

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (block && typeof block === 'object') {
        if ('text' in block && typeof block.text === 'string') {
          parts.push(block.text.slice(0, 500));
        }
        if ('name' in block && typeof block.name === 'string') {
          const args = 'arguments' in block && block.arguments
            ? (typeof block.arguments === 'string'
              ? block.arguments
              : JSON.stringify(block.arguments))
            : '';
          parts.push(`Tool: ${block.name}${args ? ' — ' + args.slice(0, 200) : ''}`);
        }
      }
    }
    if (parts.length) return parts.join(' ');
  }

  if (msg.toolName) {
    const resultContent = msg.content;
    if (Array.isArray(resultContent)) {
      for (const block of resultContent) {
        if (block && typeof block === 'object' && 'text' in block) {
          return `${msg.toolName}: ${String(block.text).slice(0, 300)}`;
        }
      }
    }
    return `Tool result: ${msg.toolName}`;
  }

  return `[${msg.role || 'message'}]`;
}
