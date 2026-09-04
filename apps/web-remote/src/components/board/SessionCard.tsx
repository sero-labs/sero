/**
 * Session card — one session on the board.
 *
 * The card answers three questions at a glance: what is it doing, what
 * did it last say, and does it need me.
 */

import { Loader2, MessageSquare, CircleAlert } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { formatRelativeDate } from '@/lib/format-relative-date';
import type { Session, SessionTurn } from '@/stores/workspace';
import type { SessionState } from '@/lib/gateway-client';

interface SessionCardProps {
  session: Session;
  state?: SessionState;
  lastTurn?: SessionTurn;
  unread: boolean;
  /** Milliseconds since the epoch of the last activity. */
  activity: number;
  onOpen: (workspaceId: string, sessionId: string) => void;
}

export function SessionCard({
  session,
  state,
  lastTurn,
  unread,
  activity,
  onOpen,
}: SessionCardProps) {
  const title = session.name || session.firstMessage || 'New chat';
  const snippet = lastTurn?.snippet ?? session.firstMessage;
  const failed = lastTurn?.outcome === 'error';

  return (
    <button
      type="button"
      data-testid="session-card"
      data-session-id={session.id}
      onClick={() => onOpen(session.workspaceId, session.id)}
      className={cn(
        'flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
        'hover:bg-[var(--bg-elevated)]',
        state === 'awaiting_input'
          ? 'border-status-warning-border bg-status-warning-faint'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]',
      )}
    >
      <div className="flex items-center gap-2">
        <StateIcon state={state} failed={failed} />

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            unread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
          )}
        >
          {title}
        </span>

        {unread && (
          <span
            data-testid="unread-dot"
            aria-label="Unread"
            className="size-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]"
          />
        )}
      </div>

      {snippet && (
        <p className="line-clamp-2 pl-6 text-xs text-[var(--text-muted)]">{snippet}</p>
      )}

      <p className="pl-6 text-xs text-[var(--text-muted)]">
        {stateLabel(state, failed)} · {formatRelativeDate(new Date(activity).toISOString())} ·{' '}
        {session.messageCount} msgs
      </p>
    </button>
  );
}

function StateIcon({ state, failed }: { state?: SessionState; failed: boolean }) {
  if (state === 'running') {
    return (
      <Loader2
        className="size-4 shrink-0 animate-spin text-[var(--brand-primary)]"
        aria-label="Running"
      />
    );
  }
  if (state === 'awaiting_input') {
    return (
      <span
        className="size-4 shrink-0 rounded-full border-2 border-status-warning bg-status-warning/30"
        aria-label="Awaiting input"
      />
    );
  }
  if (failed) {
    return <CircleAlert className="size-4 shrink-0 text-status-error" aria-label="Failed" />;
  }
  return <MessageSquare className="size-4 shrink-0 text-[var(--text-muted)]" />;
}

/** What the card says the session is doing. */
function stateLabel(state: SessionState | undefined, failed: boolean): string {
  if (state === 'running') return 'Running';
  if (state === 'awaiting_input') return 'Needs you';
  if (failed) return 'Failed';
  return 'Idle';
}
