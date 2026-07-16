import { memo, useState } from 'react';
import { Grid2x2Plus, Search, TextSearch, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Separator } from '@sero-ai/ui/components/ui/separator';
import {
  getDiscoveredApps,
  getSearchContributionApps,
  getSidebarApps,
  useAppStore,
  type AppEntry,
} from '@/stores/app';
import { useGlobalSearchStore } from '@/stores/global-search';
import { useSessionStore } from '@/stores/sessions';
import { getAppIcon } from '@/lib/app-icons';
import { openApp } from '@/lib/open-app';
import { WorkspaceTree } from '@/components/layout/workspace/WorkspaceTree';
import { cn } from '@sero-ai/ui/lib/utils';
import { AppStoreDialog } from '@/components/layout/AppStoreDialog';
import { IconAction } from '@/components/ui/IconAction';

/**
 * MainSidebar, the primary navigation sidebar.
 *
 * Top section: sidebar-visible apps (built-ins + favourited discovered apps)
 * Bottom section: workspace → session tree loaded from Pi SDK
 */
export const MainSidebar = memo(function MainSidebar() {
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
      <aside className="flex size-full min-w-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)]">
        {/* ── Apps ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5 p-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
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
              onRemoveFavourite={app.builtin ? undefined : () => toggleFavourite(app.id)}
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
});

// ── Search bar ─────────────────────────────────────────────────

function SearchBar() {
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);
  const hasGlobalSearch = useAppStore((s) => getSearchContributionApps(s.apps).length > 0);
  const openSearch = useGlobalSearchStore((s) => s.openSearch);

  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 !pl-8 text-xs"
        />
      </div>
      {hasGlobalSearch && (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Global search"
          title="Global search"
          onClick={() => openSearch()}
        >
          <TextSearch className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

// ── App list item ──────────────────────────────────────────────

function AppItem({
  entry,
  active,
  onClick,
  onRemoveFavourite,
}: {
  entry: AppEntry;
  active: boolean;
  onClick: () => void;
  onRemoveFavourite?: () => void;
}) {
  const Icon = getAppIcon(entry.icon);

  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base transition-colors',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className={cn('size-4 shrink-0', active && 'text-[var(--brand-primary)]')} />
        <span className="truncate">{entry.label}</span>
      </span>

      {onRemoveFavourite ? (
        <span className="pointer-events-none flex shrink-0 items-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <IconAction
            as="span"
            role="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onRemoveFavourite();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onRemoveFavourite();
              }
            }}
            title={`Remove ${entry.label} from favourites`}
            aria-label={`Remove ${entry.label} from favourites`}
          >
            <X className="size-3" />
          </IconAction>
        </span>
      ) : null}
    </button>
  );
}
