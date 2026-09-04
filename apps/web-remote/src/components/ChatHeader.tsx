/**
 * Chat header — `h-9`, matching the desktop `ChatPanel` header.
 *
 * `Bot` icon, an `AGENT` label, the session chip, and a slot on the
 * right for the usage badge (#258).
 */

import { Bot } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';

export function ChatHeader() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace);

  const session = activeWorkspaceId
    ? (sessionsByWorkspace[activeWorkspaceId] ?? []).find((s) => s.id === activeSessionId)
    : undefined;
  const title = session?.name || session?.firstMessage;

  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
      <Bot className="size-3.5 text-[var(--text-muted)]" />
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        Agent
      </span>
      {title && (
        <span className="max-w-[240px] truncate rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
          {title}
        </span>
      )}
      <div className="flex-1" />
    </header>
  );
}
