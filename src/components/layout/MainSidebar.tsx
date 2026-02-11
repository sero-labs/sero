import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  useAppStore,
  apps,
  dummyChatSessions,
  type AppId,
} from '@/stores/app';
import { cn } from '@/lib/utils';

/**
 * MainSidebar — the primary navigation sidebar.
 *
 * Top section: list of apps (Coding, Calendar, Todos, etc.)
 * Bottom section: chat sessions with search/filter.
 */
export function MainSidebar() {
  const open = useAppStore((s) => s.mainSidebarOpen);
  const activeApp = useAppStore((s) => s.activeApp);
  const setActiveApp = useAppStore((s) => s.setActiveApp);
  const chatSearch = useAppStore((s) => s.chatSearch);
  const setChatSearch = useAppStore((s) => s.setChatSearch);

  if (!open) return null;

  const filteredChats = dummyChatSessions.filter(
    (c) =>
      !chatSearch ||
      c.title.toLowerCase().includes(chatSearch.toLowerCase())
  );

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

      {/* ── Chats ─────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <span className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Chats
        </span>

        {/* Search */}
        <div className="relative px-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Search chats…"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            className="h-7 pl-8 text-xs"
          />
        </div>

        {/* Session list */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto pt-1">
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-elevated)]"
            >
              <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                {chat.title}
              </span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">
                {chat.preview}
              </span>
            </button>
          ))}

          {filteredChats.length === 0 && (
            <span className="px-2 py-4 text-center text-[11px] text-[var(--text-muted)]">
              No chats found
            </span>
          )}
        </div>
      </div>
    </aside>
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
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
      )}
    >
      <span className="text-sm">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
