/**
 * Session row — copies the desktop `SessionNode` markup and classes.
 *
 * Delete is shown only when the caller passes `onDelete`, and asks for
 * confirmation first, like the desktop `SessionNode`. The trigger is a
 * `span`, because the row itself is a button and a button cannot nest.
 *
 * The desktop reveals its row actions on hover. A phone has no hover,
 * so the delete control stays visible and keeps a finger-sized target.
 *
 * Rename and multi-select are still not shown: the gateway has no
 * request for them, and a control that cannot work is worse than none.
 */

import { useState } from 'react';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';
import { formatRelativeDate } from '@/lib/format-relative-date';
import type { Session } from '@/stores/workspace';
import type { SessionState } from '@/lib/gateway-client';

interface SessionRowProps {
  session: Session;
  isActive: boolean;
  state?: SessionState;
  /** Shown instead of the time when a search matched this session. */
  snippet?: string;
  /** Shown after the title when results span workspaces. */
  workspaceName?: string;
  onSelect: (sessionId: string) => void;
  /** Omit to hide the delete control. */
  onDelete?: (sessionId: string) => void;
}

export function SessionRow({
  session,
  isActive,
  state,
  snippet,
  workspaceName,
  onSelect,
  onDelete,
}: SessionRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const title = session.name || session.firstMessage || 'New chat';
  const modified = formatRelativeDate(session.updatedAt);

  return (
    <button
      type="button"
      data-testid="session-row"
      data-session-id={session.id}
      onClick={() => onSelect(session.id)}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
        isActive
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      {isActive && (
        <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--accent-primary)]" />
      )}

      <span className="flex size-4 shrink-0 items-center justify-center">
        {state === 'running' ? (
          <Loader2 className="size-4 animate-spin text-[var(--brand-primary)]" aria-label="Running" />
        ) : state === 'awaiting_input' ? (
          <span
            className="size-1.5 rounded-full bg-status-warning animate-pulse"
            aria-label="Awaiting input"
          />
        ) : (
          <MessageSquare
            className={cn(
              'size-3.5',
              isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-muted)]',
            )}
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-sm font-medium',
            isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]',
          )}
        >
          {title}
        </span>
        {snippet ? (
          <span className="truncate text-xs text-[var(--text-muted)]">{snippet}</span>
        ) : (
          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            {modified && <span>{modified}</span>}
            {session.messageCount > 0 && (
              <>
                {modified && <span>·</span>}
                <span>
                  {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {workspaceName && (
        <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-1.5 text-xs text-[var(--text-muted)]">
          {workspaceName}
        </span>
      )}

      {onDelete && (
        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger asChild>
            <span
              role="button"
              tabIndex={-1}
              aria-label="Delete session"
              title="Delete session"
              data-testid="session-delete"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-status-error"
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setConfirmOpen(true); } }}
            >
              <Trash2 className="size-3.5" />
            </span>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
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
                className="h-7 px-2 text-base"
                onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-base"
                data-testid="session-delete-confirm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(false);
                  onDelete(session.id);
                }}
              >
                Delete
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </button>
  );
}
