import { useState, useCallback } from 'react';
import { Search, Store, Loader2, Globe } from 'lucide-react';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sero-ai/ui/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type { AppEntry } from '@/stores/app';
import type { DiscoveredPlugin } from '@/types/ipc';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { AppStoreCard } from './AppStoreCard';
import { DiscoverPluginCard } from './DiscoverPluginCard';

interface AppStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: AppEntry[];
  activeApp: string;
  isFavourite: (appId: string) => boolean;
  onToggleFavourite: (appId: string) => void;
  onActivateApp: (appId: string) => void;
}

function buildSearchText(app: AppEntry): string {
  const manifest = app.manifest;
  const plugin = manifest?.plugin;
  return [
    app.label,
    manifest?.description ?? '',
    manifest?.packageName ?? '',
    manifest?.version ?? '',
    manifest?.scope ?? '',
    plugin?.category ?? '',
    plugin?.tags?.join(' ') ?? '',
    plugin?.minSeroVersion ?? '',
    plugin ? (plugin.preBuilt ? 'pre-built' : 'source') : '',
  ]
    .join('\n')
    .toLowerCase();
}

export function AppStoreDialog({
  open,
  onOpenChange,
  apps,
  activeApp,
  isFavourite,
  onToggleFavourite,
  onActivateApp,
}: AppStoreDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('installed');

  // Discover tab state
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverResults, setDiscoverResults] = useState<DiscoveredPlugin[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverSearched, setDiscoverSearched] = useState(false);

  const query = searchQuery.trim().toLowerCase();
  const filteredApps = apps
    .filter((app) => {
      if (!query) return true;
      return buildSearchText(app).includes(query);
    })
    .slice()
    .sort((a, b) => {
      const favDelta = Number(isFavourite(b.id)) - Number(isFavourite(a.id));
      if (favDelta !== 0) return favDelta;
      return a.label.localeCompare(b.label);
    });

  const runDiscoverSearch = useCallback(async (q: string) => {
    setDiscoverLoading(true);
    setDiscoverSearched(true);
    try {
      const results = await window.sero.plugins.search(q);
      setDiscoverResults(results);
    } catch (err) {
      console.error('[AppStore] Plugin search failed:', err);
      setDiscoverResults([]);
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  const debouncedSearch = useDebouncedCallback((q: string) => {
    runDiscoverSearch(q);
  }, 400);

  const handleDiscoverQueryChange = (value: string) => {
    setDiscoverQuery(value);
    debouncedSearch(value);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Auto-search on first visit to discover tab
    if (tab === 'discover' && !discoverSearched) {
      runDiscoverSearch('');
    }
  };

  const handleInstallPlugin = async (plugin: DiscoveredPlugin) => {
    await window.sero.plugins.install(plugin.installSource);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSearchQuery('');
      setActiveTab('installed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(82vh,44rem)] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-[var(--border-default)] px-4 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Store className="size-4" />
            App Store
          </DialogTitle>
          <DialogDescription>
            Browse installed apps or discover new plugins from the community.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--border-default)] px-4">
            <TabsList variant="line" className="h-9">
              <TabsTrigger value="installed" className="text-xs">
                Installed
              </TabsTrigger>
              <TabsTrigger value="discover" className="text-xs">
                <Globe className="mr-1 size-3" />
                Discover
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="installed" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="border-b border-[var(--border-default)] px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search installed apps…"
                  className="pl-9"
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {apps.length === 0 ? (
                  <EmptyState message="No discovered apps yet." />
                ) : filteredApps.length === 0 ? (
                  <EmptyState message={`No apps match "${searchQuery}".`} />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {filteredApps.map((app) => (
                      <AppStoreCard
                        key={app.id}
                        entry={app}
                        active={activeApp === app.id}
                        favourite={isFavourite(app.id)}
                        onToggleFavourite={() => onToggleFavourite(app.id)}
                        onActivate={() => {
                          onActivateApp(app.id);
                          handleOpenChange(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="discover" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="border-b border-[var(--border-default)] px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={discoverQuery}
                  onChange={(event) => handleDiscoverQueryChange(event.target.value)}
                  placeholder="Search public plugins…"
                  className="pl-9"
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {discoverLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-5 animate-spin text-[var(--text-muted)]" />
                  </div>
                ) : !discoverSearched ? (
                  <EmptyState message="Search for community plugins above." />
                ) : discoverResults.length === 0 ? (
                  <EmptyState message={discoverQuery ? `No plugins found for "${discoverQuery}".` : 'No public plugins found.'} />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {discoverResults.map((plugin) => (
                      <DiscoverPluginCard
                        key={plugin.installSource}
                        plugin={plugin}
                        onInstall={handleInstallPlugin}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-default)] p-6 text-center">
      <p className="text-sm text-[var(--text-secondary)]">{message}</p>
    </div>
  );
}
