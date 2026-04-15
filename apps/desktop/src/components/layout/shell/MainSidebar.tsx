import { useState } from 'react';
import { Grid2x2Plus, Search } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Separator } from '@sero-ai/ui/components/ui/separator';
import {
  getDiscoveredApps,
  getSidebarApps,
  useAppStore,
  type AppEntry,
} from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import { getAppIcon } from '@/lib/app-icons';
import { openApp } from '@/lib/open-app';
import { WorkspaceTree } from '@/components/layout/WorkspaceTree';
import { cn } from '@sero-ai/ui/lib/utils';
import { AppStoreDialog } from '@/components/layout/AppStoreDialog';

/**
 * MainSidebar — the primary navigation sidebar.
 *
 * Top section: sidebar-visible apps (built-ins + favourited discovered apps)
 * Bottom section: workspace → session tree loaded from Pi SDK
 */
export function MainSidebar() {
  const [appStoreOpen, setAppStoreOpen] = useState(false);
  const open = useAppStore((s) => s.mainSidebarOpen);
  const apps = useAppStore((s) => s.apps);
  const favouriteApps = useAppStore((s) => s.favouriteApps);
  const toggleFavourite = useAppStore((s) => s.toggleFavourite);
  const isFavourite = useAppStore((s) => s.isFavourite);
  const activeApp = useAppStore((s) => s.activeApp);

  const sidebarApps = getSidebarApps(apps, favouriteApps);
  const discoveredApps = getDiscoveredApps(apps);

  if (!open) return null;

  return (
    <>
      <aside className="flex h-full w-full min-w-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)]">
        {/* ── Apps ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5 p-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Apps
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Open App Store"
              onClick={() => setAppStoreOpen(true)}
            >
              <Grid2x2Plus className="size-3.5" />
            </Button>
          </div>
          {sidebarApps.map((app) => (
            <AppItem
              key={app.id}
              entry={app}
              active={activeApp === app.id}
              onClick={() => openApp(app.id)}
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

      <AppStoreDialog
        open={appStoreOpen}
        onOpenChange={setAppStoreOpen}
        apps={discoveredApps}
        activeApp={activeApp}
        isFavourite={isFavourite}
        onToggleFavourite={toggleFavourite}
        onActivateApp={openApp}
      />
    </>
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

function AppItem({
  entry,
  active,
  onClick,
}: {
  entry: AppEntry;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = getAppIcon(entry.icon);

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
      <Icon className={cn('size-4 shrink-0', active && 'text-[var(--status-success)]')} />
      <span className="truncate">{entry.label}</span>
    </button>
  );
}
