import { memo, useState } from 'react';
import { FolderOpen, Loader2, PackagePlus, Trash2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import type { InstalledPlugin } from '@sero-ai/common';
import { getSero } from '../../hooks/host';
import { PluginSection, SectionHeader } from './section-ui';

interface InstalledPluginsSectionProps {
  plugins: InstalledPlugin[];
  loading: boolean;
  error: string | null;
  installing: boolean;
  uninstallingIds: string[];
  onInstall: (source: string) => Promise<boolean>;
  onUninstall: (pluginId: string) => Promise<void>;
  onReveal: (pluginPath: string) => Promise<void>;
}

export const InstalledPluginsSection = memo(function InstalledPluginsSection({
  plugins,
  loading,
  error,
  installing,
  uninstallingIds,
  onInstall,
  onUninstall,
  onReveal,
}: InstalledPluginsSectionProps) {
  const [installSource, setInstallSource] = useState('');
  const [pickingLocalInstall, setPickingLocalInstall] = useState(false);

  const uninstallingPluginIds = new Set(uninstallingIds);

  const handleInstall = async () => {
    const installed = await onInstall(installSource);
    if (installed) {
      setInstallSource('');
    }
  };

  const handleBrowseLocalInstall = async () => {
    setPickingLocalInstall(true);
    try {
      const folder = await getSero().workspace.pickFolder();
      if (folder) {
        setInstallSource(folder);
      }
    } catch (err) {
      console.error('[admin] Failed to pick a local plugin bundle:', err);
    } finally {
      setPickingLocalInstall(false);
    }
  };

  return (
    <PluginSection>
      <SectionHeader
        icon={PackagePlus}
        title="Installed Plugins"
        description="Managed plugin installs for this profile. Packaged releases from npm, git, or a built local bundle."
      />

      <div className="space-y-4 p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleInstall();
          }}
          className="space-y-2"
        >
          <label htmlFor="plugin-install-source" className="block text-xs text-muted-foreground/70">
            Install from source · package, git URL, or local dist path
          </label>
          <div className="flex flex-col gap-2 @xl:flex-row">
            <div className="relative min-w-0 flex-1">
              <PackagePlus className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                id="plugin-install-source"
                value={installSource}
                onChange={(event) => setInstallSource(event.target.value)}
                placeholder="npm:@sero/plugin-my-app@latest or /absolute/path/to/dist/plugin"
                className="h-9 pl-8 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={installing || pickingLocalInstall}
                onClick={() => {
                  void handleBrowseLocalInstall();
                }}
                className="h-9 flex-1 text-sm @xl:flex-none"
              >
                <FolderOpen className="size-3.5" />
                {pickingLocalInstall ? 'Browsing…' : 'Browse local'}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={installing || !installSource.trim()}
                className="h-9 flex-1 text-sm @xl:flex-none"
              >
                {installing ? 'Installing…' : 'Install plugin'}
              </Button>
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="admin-loading rounded-lg border border-border/40 bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
            Loading installed plugins…
          </div>
        ) : plugins.length === 0 ? (
          <InstalledPluginsEmptyState />
        ) : (
          <ul className="flex flex-col gap-2">
            {plugins.map((plugin) => (
              <InstalledPluginRow
                key={plugin.id}
                plugin={plugin}
                uninstalling={uninstallingPluginIds.has(plugin.id)}
                onReveal={() => {
                  void onReveal(plugin.packagePath);
                }}
                onUninstall={() => {
                  void onUninstall(plugin.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </PluginSection>
  );
});

function InstalledPluginRow({
  plugin,
  uninstalling,
  onReveal,
  onUninstall,
}: {
  plugin: InstalledPlugin;
  uninstalling: boolean;
  onReveal: () => void;
  onUninstall: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-muted/20 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-3">
      <div className="min-w-0 @lg:flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-medium text-foreground">{plugin.name}</h4>
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-xs">
            {plugin.hasUI ? 'UI' : 'Tool'}
          </Badge>
          {plugin.version ? (
            <span className="shrink-0 font-mono text-xs text-muted-foreground/60">v{plugin.version}</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {plugin.description ?? 'No description provided.'}
        </p>
        <p
          title={plugin.source}
          className="mt-0.5 truncate font-mono text-xs text-muted-foreground/60"
        >
          {plugin.source}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-8 text-sm" onClick={onReveal}>
          <FolderOpen className="size-3.5" />
          Reveal in Finder
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={uninstalling ? `Removing ${plugin.name}` : `Uninstall ${plugin.name}`}
          title={uninstalling ? 'Removing…' : 'Uninstall'}
          className="size-8 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onUninstall}
          disabled={uninstalling}
        >
          {uninstalling ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </li>
  );
}

function InstalledPluginsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-background/30 px-6 py-9 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <PackagePlus className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">No installed plugins yet</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Install an optional Sero app from npm, git, or a local build. Installed plugins appear in the
        sidebar immediately and stay separate from local development sessions.
      </p>
    </div>
  );
}
