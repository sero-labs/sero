/**
 * GlobalSearchDialog, overlay hosting app-contributed global-search panels.
 *
 * Apps contribute panels to `ui.global-search.panel`; this dialog
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
import { getContributions, useAppStore, type ResolvedContribution } from '@/stores/app';
import { useGlobalSearchStore } from '@/stores/global-search';
import { getAppIcon } from '@/lib/app-icons';
import { SearchContributionMount } from './SearchContributionMount';

export function GlobalSearchDialog() {
  const open = useGlobalSearchStore((s) => s.open);
  const setOpen = useGlobalSearchStore((s) => s.setOpen);
  const activeContributionKey = useGlobalSearchStore((s) => s.activeContributionKey);
  const setActiveContributionKey = useGlobalSearchStore((s) => s.setActiveContributionKey);
  const apps = useAppStore((s) => s.apps);

  // Contributed panels ask to dismiss the overlay via this window event (e.g.
  // after opening a search result), keeping them decoupled from this store.
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(SERO_GLOBAL_SEARCH_CLOSE_EVENT, close);
    return () => window.removeEventListener(SERO_GLOBAL_SEARCH_CLOSE_EVENT, close);
  }, [setOpen]);

  const contributions = getContributions(apps, 'ui.global-search.panel');
  if (contributions.length === 0) return null;
  const contributionCountByApp = contributions.reduce<Map<string, number>>((counts, resolved) => {
    counts.set(resolved.app.id, (counts.get(resolved.app.id) ?? 0) + 1);
    return counts;
  }, new Map());

  const activeKey = contributions.some((resolved) => resolved.key === activeContributionKey)
    ? activeContributionKey!
    : contributions[0].key;

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
              <SearchContributionMount resolved={contributions[0]} />
            </div>
          </>
        ) : (
          <Tabs
            value={activeKey}
            onValueChange={setActiveContributionKey}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <SearchHeaderBar>
              <TabsList>
                {contributions.map((resolved) => (
                  <SearchTabTrigger
                    key={resolved.key}
                    resolved={resolved}
                    showContributionId={(contributionCountByApp.get(resolved.app.id) ?? 0) > 1}
                  />
                ))}
              </TabsList>
            </SearchHeaderBar>
            {contributions.map((resolved) => (
              <TabsContent key={resolved.key} value={resolved.key} className="min-h-0 flex-1">
                <SearchContributionMount resolved={resolved} />
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

function SearchTabTrigger({
  resolved,
  showContributionId,
}: {
  resolved: ResolvedContribution<'ui.global-search.panel'>;
  showContributionId: boolean;
}) {
  const Icon = getAppIcon(resolved.app.icon);
  return (
    <TabsTrigger value={resolved.key}>
      <Icon className="size-3.5" />
      {resolved.app.label}
      {showContributionId ? ` (${resolved.contribution.id})` : null}
    </TabsTrigger>
  );
}
