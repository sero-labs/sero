import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useSessionStore } from '@/stores/sessions';
import { useStreamingSessionIds } from '@/stores/agent-selectors';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import type { SeroSessionInfo } from '@/types/ipc';
import { cn } from '@sero-ai/ui/lib/utils';

// ── Session node ───────────────────────────────────────────────

export function SessionNode({
  session,
  workspaceSessions,
}: {
  session: SeroSessionInfo;
  /** All sessions in this workspace — needed for Shift+click range selection. */
  workspaceSessions: SeroSessionInfo[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const streamingIds = useStreamingSessionIds();

  // Multi-select
  const isSelected = useSessionStore((s) => s.selectedSessionIds.has(session.id));
  const hasSelection = useSessionStore((s) => s.selectedSessionIds.size > 0);
  const toggleSelectSession = useSessionStore((s) => s.toggleSelectSession);
  const selectSessionRange = useSessionStore((s) => s.selectSessionRange);
  const clearSelection = useSessionStore((s) => s.clearSelection);

  const isActive = activeSessionId === session.id;
  const isStreaming = streamingIds.includes(session.id);

  const title = session.name || session.firstMessage || 'New chat';
  const modified = formatRelativeDate(session.modified);

  // Focus the input when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const startRename = () => {
    setRenameValue(session.name || session.firstMessage || '');
    setIsRenaming(true);
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === title) return;
    try {
      await renameSession(session.id, trimmed);
    } catch (err) {
      console.error('[SessionNode] rename failed:', err);
    }
  };

  const cancelRename = () => {
    setIsRenaming(false);
  };

  const handleDelete = async () => {
    setConfirmOpen(false);
    await deleteSession(session.path);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Shift+click — range select
      e.preventDefault();
      selectSessionRange(session.id, workspaceSessions);
    } else if (e.metaKey || e.ctrlKey) {
      // Ctrl/Cmd+click — toggle individual
      e.preventDefault();
      toggleSelectSession(session.id);
    } else {
      // Normal click — activate session and clear selection
      if (hasSelection) clearSelection();
      setActiveSession(session.id);
    }
  };

  return (
    <button
      onClick={handleClick}
      onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
      className={cn(
        'group flex w-full items-center gap-4 rounded-md px-2 py-1 text-left transition-colors',
        isSelected
          ? 'bg-[var(--accent-muted)]/15 ring-1 ring-[var(--accent-primary)]/30 text-[var(--text-primary)]'
          : isActive
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      {/* Leading indicator: checkmark when selected, spinner when streaming */}
      <span className="flex size-3 shrink-0 items-center justify-center">
        {isSelected ? (
          <Check className="size-3 text-[var(--accent-primary)]" />
        ) : isStreaming ? (
          <Loader2 className="size-3 animate-spin text-[var(--status-success)]" />
        ) : null}
      </span>

      {/* Title + metadata */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            className="w-full truncate rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--status-success)]"
          />
        ) : (
          <span className={cn('truncate text-sm font-medium', isActive ? 'text-[var(--status-success)]' : 'text-[var(--text-primary)]')}>
            {title}
          </span>
        )}
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

      {/* Actions: rename + delete (hidden during multi-select — bulk actions live on workspace header) */}
      <span className={cn(
        'flex shrink-0 items-center gap-0.5 transition-opacity',
        hasSelection ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100',
      )}>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); startRename(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); startRename(); } }}
          className="rounded p-0.5 hover:bg-[var(--bg-base)]"
          title="Rename session"
        >
          <Pencil className="size-3 text-[var(--text-muted)]" />
        </span>

        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger asChild>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setConfirmOpen(true); } }}
              className="rounded p-0.5 hover:bg-[var(--bg-base)]"
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
      </span>
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
