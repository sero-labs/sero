import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAppStore, type AppEntry } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import { WorkspaceTree } from './WorkspaceTree';
import { cn } from '@/lib/utils';

/**
 * MainSidebar — the primary navigation sidebar.
 *
 * Top section: list of apps (built-in + discovered sero apps)
 * Bottom section: workspace → session tree loaded from Pi SDK
 */
export function MainSidebar() {
  const open = useAppStore((s) => s.mainSidebarOpen);
  const apps = useAppStore((s) => s.apps);
  const activeApp = useAppStore((s) => s.activeApp);
  const setActiveApp = useAppStore((s) => s.setActiveApp);

  if (!open) return null;

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)]">
      {/* ── Apps ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5 p-2">
        <span className="px-2 pb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Apps
        </span>
        {apps.map((app) => (
          <AppItem
            key={app.id}
            entry={app}
            active={activeApp === app.id}
            onClick={() => setActiveApp(app.id)}
          />
        ))}
      </div>

      <Separator className="mx-2" />

      {/* ── Search ────────────────────────────────────────────── */}
      <SearchBar />

      {/* ── Workspace → Session tree ──────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <WorkspaceTree />
      </div>
    </aside>
  );
}

// ── Search bar ─────────────────────────────────────────────────

function SearchBar() {
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);

  return (
    <div className="px-3 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          placeholder="Search sessions…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 pl-8 text-xs"
        />
      </div>
    </div>
  );
}

// ── App list item ──────────────────────────────────────────────

/** Map Lucide icon names to emoji for discovered apps (simple fallback). */
const ICON_MAP: Record<string, string> = {
  'check-square': '✅',
  code: '💻',
  calendar: '📅',
  activity: '💪',
  'piggy-bank': '🏦',
  box: '📦',
};

function AppItem({
  entry,
  active,
  onClick,
}: {
  entry: AppEntry;
  active: boolean;
  onClick: () => void;
}) {
  // Built-in apps use their emoji directly; discovered apps map the Lucide name
  const icon = entry.builtin ? entry.icon : (ICON_MAP[entry.icon] ?? '📦');

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
      )}
    >
      <span className="text-sm">{icon}</span>
      <span className="truncate">{entry.label}</span>
    </button>
  );
}
