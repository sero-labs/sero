import { useCallback, useRef, useState } from 'react';
import { Search, Store, Loader2, Globe } from 'lucide-react';
import { Input } from '@sero-ai/ui/components/ui/input';
import { PluginSafetyDisclaimer } from '@sero-ai/ui/components/ui/plugin-safety-disclaimer';
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
import { ErrorSurface } from './ErrorSurface';
import { toErrorMessage } from './error-utils';
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
    plugin?.requiredHostCapabilities?.join(' ') ?? '',
    manifest?.hostCompatibility?.issues.map((issue) => issue.message).join(' ') ?? '',
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
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const discoverRequestIdRef = useRef(0);
  const discoverSessionRef = useRef(0);
  const dialogOpenRef = useRef(open);
  dialogOpenRef.current = open;

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

  const runDiscoverSearch = useCallback(async (q: string, sessionId: number) => {
    if (!dialogOpenRef.current || sessionId !== discoverSessionRef.current) return;

    const requestId = ++discoverRequestIdRef.current;
    setDiscoverLoading(true);
    setDiscoverSearched(true);
    setDiscoverError(null);

    try {
      const results = await window.sero.plugins.search(q);
      if (
        requestId !== discoverRequestIdRef.current ||
        sessionId !== discoverSessionRef.current ||
        !dialogOpenRef.current
      ) {
        return;
      }
      setDiscoverResults(results);
      setDiscoverError(null);
    } catch (err) {
      if (
        requestId !== discoverRequestIdRef.current ||
        sessionId !== discoverSessionRef.current ||
        !dialogOpenRef.current
      ) {
        return;
      }
      console.error('[AppStore] Plugin search failed:', err);
      setDiscoverResults([]);
      setDiscoverError(toErrorMessage(err, 'Plugin discovery is unavailable right now.'));
    } finally {
      if (
        requestId === discoverRequestIdRef.current &&
        sessionId === discoverSessionRef.current &&
        dialogOpenRef.current
      ) {
        setDiscoverLoading(false);
      }
    }
  }, []);

  const debouncedSearch = useDebouncedCallback((q: string, sessionId: number) => {
    void runDiscoverSearch(q, sessionId);
  }, 400);

  const handleDiscoverQueryChange = (value: string) => {
    setDiscoverQuery(value);
    debouncedSearch(value, discoverSessionRef.current);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'discover' && !discoverSearched) {
      void runDiscoverSearch('', discoverSessionRef.current);
    }
  };

  const handleInstallPlugin = async (plugin: DiscoveredPlugin) => {
    const manifest = await window.sero.plugins.install(plugin.installSource);
    if (!dialogOpenRef.current) return;

    setDiscoverResults((results) => markPluginInstalled(results, plugin, manifest.id));
    handleOpenChange(false);
  };

  const handleUninstallPlugin = async (plugin: DiscoveredPlugin) => {
    if (!plugin.installedPluginId) {
      throw new Error('Could not determine which installed plugin to uninstall.');
    }

    await window.sero.plugins.uninstall(plugin.installedPluginId);
    if (!dialogOpenRef.current) return;

    setDiscoverResults((results) => markPluginUninstalled(results, plugin));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    dialogOpenRef.current = nextOpen;
    onOpenChange(nextOpen);

    if (!nextOpen) {
      discoverRequestIdRef.current += 1;
      discoverSessionRef.current += 1;
      setSearchQuery('');
      setActiveTab('installed');
      setDiscoverQuery('');
      setDiscoverResults([]);
      setDiscoverLoading(false);
      setDiscoverSearched(false);
      setDiscoverError(null);
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
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--banner-primary)]" />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search installed apps…"
                  className="h-11 rounded-xl border-[var(--banner-primary-border)] bg-[var(--bg-base)] pl-10 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/75 focus-visible:border-[var(--border-focus)] focus-visible:ring-[var(--banner-primary-muted)]"
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
            <div className="shrink-0 border-b border-[var(--border-default)] px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--banner-primary)]" />
                <Input
                  value={discoverQuery}
                  onChange={(event) => handleDiscoverQueryChange(event.target.value)}
                  placeholder="Search public plugins…"
                  className="h-11 rounded-xl border-[var(--banner-primary-border)] bg-[var(--bg-base)] pl-10 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/75 focus-visible:border-[var(--border-focus)] focus-visible:ring-[var(--banner-primary-muted)]"
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
                ) : discoverError ? (
                  <ErrorSurface
                    title="Couldn't search plugins"
                    message={discoverError}
                    onRetry={() => void runDiscoverSearch(discoverQuery, discoverSessionRef.current)}
                  />
                ) : discoverResults.length === 0 ? (
                  <EmptyState message={discoverQuery ? `No plugins found for "${discoverQuery}".` : 'No public plugins found.'} />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {discoverResults.map((plugin) => (
                      <DiscoverPluginCard
                        key={plugin.installSource}
                        plugin={plugin}
                        onInstall={handleInstallPlugin}
                        onUninstall={handleUninstallPlugin}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            <PluginSafetyDisclaimer />
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

function markPluginInstalled(
  results: DiscoveredPlugin[],
  installedPlugin: DiscoveredPlugin,
  installedPluginId: string,
): DiscoveredPlugin[] {
  return results.map((plugin) => {
    if (!isSameDiscoveredPlugin(plugin, installedPlugin)) return plugin;
    return { ...plugin, installed: true, installedPluginId };
  });
}

function markPluginUninstalled(
  results: DiscoveredPlugin[],
  uninstalledPlugin: DiscoveredPlugin,
): DiscoveredPlugin[] {
  return results.map((plugin) => {
    if (!isSameDiscoveredPlugin(plugin, uninstalledPlugin)) return plugin;
    return { ...plugin, installed: false, installedPluginId: null };
  });
}

function isSameDiscoveredPlugin(
  plugin: DiscoveredPlugin,
  target: DiscoveredPlugin,
): boolean {
  const pluginRepoKey = getGitHubRepoKey(plugin.githubUrl);
  const targetRepoKey = getGitHubRepoKey(target.githubUrl);

  return (
    plugin.installSource === target.installSource ||
    (plugin.npmPackage !== null && plugin.npmPackage === target.npmPackage) ||
    (pluginRepoKey !== null && pluginRepoKey === targetRepoKey)
  );
}

function getGitHubRepoKey(url: string | null): string | null {
  if (!url) return null;

  const match = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;
  return `${match[1]}/${match[2].replace(/\.git$/i, '')}`.toLowerCase();
}
