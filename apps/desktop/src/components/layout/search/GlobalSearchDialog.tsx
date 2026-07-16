/**
 * GlobalSearchDialog, overlay hosting app-contributed global-search panels.
 *
 * Apps declare a panel via `sero.app.search` in their manifest; this dialog
 * mounts the federated component(s). With multiple contributions the panels
 * are switchable via tabs. Opened from the main sidebar and the ⌘K menu.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sero-ai/ui/components/ui/tabs';
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

  const contributions = getSearchContributionApps(apps);
  if (contributions.length === 0) return null;

  const activeId = contributions.some((app) => app.id === activeAppId)
    ? activeAppId!
    : contributions[0].id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(70vh,40rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Global Search</DialogTitle>
          <DialogDescription>Search panels contributed by installed apps</DialogDescription>
        </DialogHeader>
        {contributions.length === 1 ? (
          <div className="min-h-0 flex-1">
            <SearchContributionMount manifest={contributions[0].manifest!} />
          </div>
        ) : (
          <Tabs
            value={activeId}
            onValueChange={setActiveAppId}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <TabsList className="m-2 self-start">
              {contributions.map((app) => (
                <SearchTabTrigger key={app.id} app={app} />
              ))}
            </TabsList>
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

function SearchTabTrigger({ app }: { app: AppEntry }) {
  const Icon = getAppIcon(app.icon);
  return (
    <TabsTrigger value={app.id}>
      <Icon className="size-3.5" />
      {app.label}
    </TabsTrigger>
  );
}
