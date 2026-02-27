/**
 * MailView — Gmail inbox list and thread detail.
 *
 * Styled to match ToolCallGroup: compact cards, collapsible groups,
 * status dots, small text, CSS variable colors.
 */

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Search, Archive, Mail, Inbox } from 'lucide-react';
import type { GoogleAppState, GmailThread } from '../../shared/types';
import type { GoogleApi } from '../hooks/useGoogleApi';
import { MailThread } from './MailThread';
import { formatRelativeDate, extractName } from './format-utils';

type StateUpdater = (fn: (prev: GoogleAppState) => GoogleAppState) => void;

interface MailViewProps {
  state: GoogleAppState;
  updateState: StateUpdater;
  google: GoogleApi;
}

export function MailView({ state, updateState, google }: MailViewProps) {
  const [searchQuery, setSearchQuery] = useState(state.gmail.lastQuery || '');
  const { threads, selectedThreadId, selectedMessages } = state.gmail;

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      google.fetchInbox(searchQuery.trim());
    }
  }, [searchQuery, google]);

  const selectThread = useCallback((threadId: string) => {
    google.fetchThread(threadId);
  }, [google]);

  const clearSelection = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      gmail: { ...prev.gmail, selectedThreadId: null, selectedMessages: [] },
    }));
  }, [updateState]);

  const handleArchive = useCallback(async (threadId: string) => {
    const ok = await google.archiveThread(threadId);
    if (ok) {
      updateState((prev) => ({
        ...prev,
        gmail: {
          ...prev.gmail,
          threads: prev.gmail.threads.filter((t) => t.id !== threadId),
          selectedThreadId: prev.gmail.selectedThreadId === threadId ? null : prev.gmail.selectedThreadId,
          selectedMessages: prev.gmail.selectedThreadId === threadId ? [] : prev.gmail.selectedMessages,
        },
      }));
    }
  }, [google, updateState]);

  // Thread detail view
  if (selectedThreadId && selectedMessages.length > 0) {
    return (
      <MailThread
        messages={selectedMessages}
        onBack={clearSelection}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-1.5">
        <Search className="size-3.5 text-[var(--text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Gmail…  (e.g. newer_than:7d, from:boss)"
          className="flex-1 bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 outline-none"
        />
        <button
          type="submit"
          disabled={!searchQuery.trim() || google.loading}
          className="rounded px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          Search
        </button>
      </form>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <EmptyInbox loading={google.loading} error={google.error} />
        ) : (
          <div className="py-1">
            {threads.map((thread, i) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                index={i}
                onSelect={selectThread}
                onArchive={handleArchive}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {threads.length > 0 && (
        <div className="shrink-0 border-t border-[var(--border-subtle)]/60 px-3 py-1">
          <span className="text-[11px] text-[var(--text-muted)]">
            {threads.length} threads · last synced {state.gmail.lastFetchedAt ? formatRelativeDate(state.gmail.lastFetchedAt) : 'never'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Thread row (ToolCallGroup style) ─────────────────────────

function ThreadRow({
  thread,
  index,
  onSelect,
  onArchive,
}: {
  thread: GmailThread;
  index: number;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div
      className="animate-g-fade-in group flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors hover:bg-[var(--bg-elevated)]/60"
      style={{ animationDelay: `${index * 20}ms` }}
      onClick={() => onSelect(thread.id)}
    >
      {/* Unread dot */}
      <div className="mt-1.5 flex shrink-0 items-center">
        {thread.isUnread ? (
          <span className="size-1.5 rounded-full bg-blue-500" />
        ) : (
          <span className="size-1.5 rounded-full bg-transparent" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`shrink-0 truncate text-[12px] ${thread.isUnread ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'}`}>
            {extractName(thread.from)}
          </span>
          {thread.messageCount > 1 && (
            <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
              ({thread.messageCount})
            </span>
          )}
          <span className="ml-auto shrink-0 text-[10px] text-[var(--text-muted)]">
            {formatRelativeDate(thread.date)}
          </span>
        </div>
        <div className={`truncate text-[11px] ${thread.isUnread ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {thread.subject}
        </div>
        <div className="truncate text-[11px] text-[var(--text-muted)]">
          {thread.snippet}
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="mt-1 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(thread.id); }}
          className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          title="Archive"
        >
          <Archive className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────

function EmptyInbox({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {loading ? (
        <>
          <div className="size-8 rounded-full border-2 border-[var(--border-subtle)] border-t-blue-500 animate-spin mb-3" />
          <p className="text-[12px] text-[var(--text-muted)]">Fetching your inbox…</p>
        </>
      ) : error ? (
        <>
          <Mail className="size-6 text-red-400/60 mb-3" />
          <p className="text-[12px] text-red-400">{error}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Make sure gogcli is installed and authenticated
          </p>
        </>
      ) : (
        <>
          <Inbox className="size-6 text-[var(--text-muted)]/40 mb-3" />
          <p className="text-[12px] text-[var(--text-muted)]">No emails found</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]/60">
            Try a different search query or click Sync
          </p>
        </>
      )}
    </div>
  );
}
