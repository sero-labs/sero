/**
 * MailWidget — Gmail inbox indicator for the dashboard.
 *
 * Shows unread count badge, recent threads with sender/subject,
 * and a status indicator for the connection.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { GoogleAppState, GmailThread } from '../../shared/types';
import { DEFAULT_GOOGLE_STATE } from '../../shared/types';

// ── Component ────────────────────────────────────────────────────

export function MailWidget() {
  const [state] = useAppState<GoogleAppState>(DEFAULT_GOOGLE_STATE);

  const { threads, lastFetchedAt } = state.gmail;
  const isConnected = state.activeAccount !== null;

  const { unreadCount, recentThreads } = useMemo(() => {
    const unread = threads.filter((t) => t.isUnread).length;
    const recent = threads.slice(0, 5);
    return { unreadCount: unread, recentThreads: recent };
  }, [threads]);

  if (!isConnected) {
    return <NotConnected />;
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* ── Header with unread badge ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MailIcon />
          <span className="text-xs font-medium text-[var(--text-secondary)]">Inbox</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5">
              <div className="size-1.5 rounded-full bg-blue-500" />
              <span className="text-[10px] font-bold tabular-nums text-blue-400">
                {unreadCount}
              </span>
            </div>
          )}
          {lastFetchedAt && (
            <span className="text-[9px] text-[var(--text-muted)]">
              {formatRelative(lastFetchedAt)}
            </span>
          )}
        </div>
      </div>

      {/* ── Thread list ── */}
      {recentThreads.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
          {recentThreads.map((thread, i) => (
            <ThreadRow key={thread.id} thread={thread} index={i} />
          ))}
          {threads.length > 5 && (
            <span className="pt-1 text-center text-[9px] text-[var(--text-muted)]">
              +{threads.length - 5} more threads
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-[var(--text-muted)]">Inbox empty</span>
        </div>
      )}
    </div>
  );
}

// ── Thread row ───────────────────────────────────────────────────

function ThreadRow({ thread, index }: { thread: GmailThread; index: number }) {
  const senderName = thread.from.replace(/<[^>]+>/, '').trim().split(' ')[0];

  return (
    <div
      className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0">
        {thread.isUnread ? (
          <div className="size-1.5 rounded-full bg-blue-500" />
        ) : (
          <div className="size-1.5 rounded-full bg-transparent" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className={`truncate text-[11px] ${
              thread.isUnread
                ? 'font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {senderName}
          </span>
          {thread.messageCount > 1 && (
            <span className="shrink-0 text-[9px] tabular-nums text-[var(--text-muted)]">
              ({thread.messageCount})
            </span>
          )}
          <span className="ml-auto shrink-0 text-[9px] tabular-nums text-[var(--text-muted)]">
            {formatShortDate(thread.date)}
          </span>
        </div>
        <div
          className={`truncate text-[10px] ${
            thread.isUnread ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {thread.subject}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Icons (inline SVG to avoid extra deps) ───────────────────────

function MailIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-[var(--text-muted)]">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 5l7 4 7-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      <div className="relative size-12">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/15 to-red-500/10" />
        <svg viewBox="0 0 24 24" fill="none" className="absolute inset-0 m-auto size-6 text-[var(--text-muted)]">
          <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 7l10 6 10-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-xs text-[var(--text-muted)]">Google not connected</span>
      <span className="text-[10px] text-[var(--text-muted)] opacity-60">
        Open Google app to sign in
      </span>
    </div>
  );
}

export default MailWidget;
