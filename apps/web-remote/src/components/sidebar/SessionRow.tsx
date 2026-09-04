/**
 * Session row — copies the desktop `SessionNode` markup and classes.
 *
 * Rename, delete and multi-select are not shown: the gateway has no
 * request for them, and a control that cannot work is worse than none.
 */

import { Loader2, MessageSquare } from 'lucide-react';
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
}

export function SessionRow({
  session,
  isActive,
  state,
  snippet,
  workspaceName,
  onSelect,
}: SessionRowProps) {
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
    </button>
  );
}
