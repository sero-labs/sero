import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useSessionStore } from '@/stores/sessions';
import { useStreamingSessionIds } from '@/stores/agent';
import { Button } from '@sero/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero/ui/components/ui/popover';
import type { SeroSessionInfo } from '@/types/ipc';
import { cn } from '@sero/ui/lib/utils';

// ── Session node ───────────────────────────────────────────────

export function SessionNode({ session }: { session: SeroSessionInfo }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const streamingIds = useStreamingSessionIds();

  const isActive = activeSessionId === session.id;
  const isStreaming = streamingIds.includes(session.id);

  const title = session.name || session.firstMessage || 'New chat';
  const modified = formatRelativeDate(session.modified);

  const handleDelete = async () => {
    setConfirmOpen(false);
    await deleteSession(session.path);
  };

  return (
    <button
      onClick={() => setActiveSession(session.id)}
      className={cn(
        'group flex w-full items-center gap-4 rounded-md px-2 py-1 text-left transition-colors',
        isActive
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      {/* Streaming spinner — only visible when agent is working */}
      <span className="flex size-3 shrink-0 items-center justify-center">
        {isStreaming && (
          <Loader2 className="size-3 animate-spin text-emerald-500" />
        )}
      </span>

      {/* Title + metadata */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <span>{modified}</span>
          {session.messageCount > 0 && (
            <>
              <span>·</span>
              <span>{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Delete with confirmation popover */}
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        <PopoverTrigger asChild>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setConfirmOpen(true); } }}
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--bg-base)] group-hover:opacity-100"
            title="Delete session"
          >
            <Trash2 className="size-3 text-[var(--text-muted)]" />
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="right"
          className="w-52 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            Delete this session?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-sm"
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-6 px-2 text-sm"
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            >
              Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
