import { useEffect } from 'react';
import { Plus, Search, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAppStore, apps, type AppId } from '@/stores/app';
import { useSessionStore, useFilteredSessions } from '@/stores/sessions';
import { cn } from '@/lib/utils';

/**
 * MainSidebar — the primary navigation sidebar.
 *
 * Top section: list of apps (Coding, Calendar, Todos, etc.)
 * Bottom section: Pi SDK sessions loaded from ~/.sero-ui/agent/sessions/
 */
export function MainSidebar() {
  const open = useAppStore((s) => s.mainSidebarOpen);
  const activeApp = useAppStore((s) => s.activeApp);
  const setActiveApp = useAppStore((s) => s.setActiveApp);

  if (!open) return null;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border/50 bg-[var(--bg-surface)]">
      {/* ── Apps ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5 p-2">
        <span className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Apps
        </span>
        {apps.map((app) => (
          <AppItem
            key={app.id}
            id={app.id}
            icon={app.icon}
            label={app.label}
            active={activeApp === app.id}
            onClick={() => setActiveApp(app.id)}
          />
        ))}
      </div>

      <Separator className="mx-2" />

      {/* ── Sessions ──────────────────────────────────────────── */}
      <SessionList />
    </aside>
  );
}

// ── Session list ───────────────────────────────────────────────

function SessionList() {
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);
  const isLoading = useSessionStore((s) => s.isLoading);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const filteredSessions = useFilteredSessions();

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
      {/* Header with new-session button */}
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Chats
        </span>
        <button
          onClick={() => createSession()}
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          title="New chat"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          placeholder="Search chats…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 pl-8 text-xs"
        />
      </div>

      {/* Session list */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto pt-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <span className="px-2 py-4 text-center text-[11px] text-[var(--text-muted)]">
            {searchQuery ? 'No chats found' : 'No chats yet'}
          </span>
        ) : (
          filteredSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={activeSessionId === session.id}
              onSelect={() => setActiveSession(session.id)}
              onDelete={() => deleteSession(session.path)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Session item ───────────────────────────────────────────────

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: { id: string; name?: string; firstMessage: string; modified: string; messageCount: number };
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const title = session.name || session.firstMessage || 'New chat';
  const modified = formatRelativeDate(session.modified);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onDelete();
            }
          }}
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--bg-base)] group-hover:opacity-100"
          title="Delete chat"
        >
          <Trash2 className="size-3 text-[var(--text-muted)]" />
        </span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
        <span>{modified}</span>
        {session.messageCount > 0 && (
          <>
            <span>·</span>
            <span>
              {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

// ── App list item ──────────────────────────────────────────────

function AppItem({
  id,
  icon,
  label,
  active,
  onClick,
}: {
  id: AppId;
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
      )}
    >
      <span className="text-sm">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
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
