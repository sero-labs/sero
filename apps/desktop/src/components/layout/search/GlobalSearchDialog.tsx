/**
 * GlobalSearchDialog, overlay hosting app-contributed global-search panels.
 *
 * Apps declare a panel via `sero.app.search` in their manifest; this dialog
 * mounts the federated component(s). With multiple contributions the panels
 * are switchable via tabs. Opened from the main sidebar and the ⌘K menu.
 */

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sero-ai/ui/components/ui/tabs';
import { XIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { SERO_GLOBAL_SEARCH_CLOSE_EVENT } from '@sero-ai/app-runtime';
import { getSearchContributionApps, useAppStore, type AppEntry } from '@/stores/app';
import { useGlobalSearchStore } from '@/stores/global-search';
import { getAppIcon } from '@/lib/app-icons';
import { SearchContributionMount } from './SearchContributionMount';

export function GlobalSearchDialog() {
  const open = useGlobalSearchStore((s) => s.open);
  const setOpen = useGlobalSearchStore((s) => s.setOpen);
  const activeAppId = useGlobalSearchStore((s) => s.activeAppId);
  const setActiveAppId = useGlobalSearchStore((s) => s.setActiveAppId);
  const apps = useAppStore((s) => s.apps);

  // Contributed panels ask to dismiss the overlay via this window event (e.g.
  // after opening a search result), keeping them decoupled from this store.
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(SERO_GLOBAL_SEARCH_CLOSE_EVENT, close);
    return () => window.removeEventListener(SERO_GLOBAL_SEARCH_CLOSE_EVENT, close);
  }, [setOpen]);

  const contributions = getSearchContributionApps(apps);
  if (contributions.length === 0) return null;

  const activeId = contributions.some((app) => app.id === activeAppId)
    ? activeAppId!
    : contributions[0].id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Own header bar (tabs + close) so the close button never overlaps the
          contributed panel's own controls; panels mount below it, full-bleed. */}
      {/* max-w-4xl is set at the sm: breakpoint too — the base content pins
          `sm:max-w-lg`, which otherwise wins at every desktop width. */}
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(72vh,44rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Global Search</DialogTitle>
          <DialogDescription>Search panels contributed by installed apps</DialogDescription>
        </DialogHeader>
        {contributions.length === 1 ? (
          <>
            <SearchHeaderBar />
            <div className="min-h-0 flex-1">
              <SearchContributionMount manifest={contributions[0].manifest!} />
            </div>
          </>
        ) : (
          <Tabs
            value={activeId}
            onValueChange={setActiveAppId}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <SearchHeaderBar>
              <TabsList>
                {contributions.map((app) => (
                  <SearchTabTrigger key={app.id} app={app} />
                ))}
              </TabsList>
            </SearchHeaderBar>
            {contributions.map((app) => (
              <TabsContent key={app.id} value={app.id} className="min-h-0 flex-1">
                <SearchContributionMount manifest={app.manifest!} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchHeaderBar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
      {children ?? <span />}
      <DialogClose className="rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <XIcon className="size-4" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </div>
  );
}

function SearchTabTrigger({ app }: { app: AppEntry }) {
  const Icon = getAppIcon(app.icon);
  return (
    <TabsTrigger value={app.id}>
      <Icon className="size-3.5" />
      {app.label}
    </TabsTrigger>
  );
}
