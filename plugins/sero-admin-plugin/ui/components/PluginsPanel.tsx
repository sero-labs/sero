import { memo, useMemo, useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { cn } from '@sero-ai/ui/lib/utils';
import type { InstalledPlugin } from '@sero/common';
import { usePlugins } from '../hooks/usePlugins';

const INSTALL_EXAMPLES = [
  {
    label: 'npm',
    value: 'npm:@sero/plugin-my-app@latest',
  },
  {
    label: 'git',
    value: 'git:https://github.com/user/sero-plugin-my-app.git',
  },
  {
    label: 'local',
    value: '/absolute/path/to/plugin/dist/plugin',
  },
] as const;

export const PluginsPanel = memo(function PluginsPanel() {
  const {
    plugins,
    loading,
    error,
    installing,
    uninstallingIds,
    install,
    uninstall,
    revealInFinder,
  } = usePlugins();
  const [installSource, setInstallSource] = useState('');

  const installedCountLabel = useMemo(() => {
    return plugins.length === 1 ? '1 installed plugin' : `${plugins.length} installed plugins`;
  }, [plugins.length]);

  const handleInstall = async () => {
    const installed = await install(installSource);
    if (installed) {
      setInstallSource('');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-foreground/85">Plugin Manager</h2>
            <p className="max-w-3xl text-[11px] leading-5 text-muted-foreground/75">
              Install optional Sero apps from npm, git, or a built local bundle. Installs
              hot-load immediately into the sidebar — no restart, no DevTools.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-indigo-500/20 bg-indigo-500/5 text-[10px] text-indigo-400"
          >
            {installedCountLabel}
          </Badge>
        </div>
      </div>

      <div className="border-b border-border/20 bg-[linear-gradient(135deg,rgba(99,102,241,0.08),transparent_55%,rgba(16,185,129,0.05))] px-4 py-4">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55">
              Install from source
            </p>
            <p className="text-[11px] leading-5 text-muted-foreground/75">
              For local installs, point to the built <code>dist/plugin</code> folder produced by
              <code className="mx-1 rounded bg-secondary px-1 py-0.5">bash scripts/build-plugin.sh ...</code>
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              value={installSource}
              onChange={(event) => setInstallSource(event.target.value)}
              placeholder="npm:@sero/plugin-my-app@latest or /absolute/path/to/dist/plugin"
              className="h-9 flex-1 bg-background/80 text-xs"
            />
            <Button
              onClick={handleInstall}
              disabled={installing || !installSource.trim()}
              className="h-9 min-w-28 bg-indigo-600 text-xs font-medium hover:bg-indigo-500"
            >
              {installing ? 'Installing…' : 'Install Plugin'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {INSTALL_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setInstallSource(example.value)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[10px] transition-colors',
                  'border-border/50 bg-background/70 text-muted-foreground hover:border-indigo-400/30 hover:text-indigo-300',
                )}
              >
                {example.label}: <span className="font-mono">{example.value}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="admin-loading text-xs text-muted-foreground">Loading plugins…</div>
        </div>
      ) : plugins.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                uninstalling={uninstallingIds.includes(plugin.id)}
                onReveal={() => revealInFinder(plugin.packagePath)}
                onUninstall={() => uninstall(plugin.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
});

function PluginCard({
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
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)] backdrop-blur-sm transition-colors hover:border-indigo-400/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/12 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
              {plugin.name.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground/90">{plugin.name}</h3>
                {plugin.hasUI ? (
                  <Badge variant="outline" className="h-5 border-emerald-500/20 bg-emerald-500/5 px-1.5 text-[9px] text-emerald-400">
                    UI
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 border-muted-foreground/20 px-1.5 text-[9px] text-muted-foreground/70">
                    Tool-only
                  </Badge>
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground/65">{plugin.id}</p>
            </div>
          </div>
        </div>

        <Badge variant="outline" className="border-indigo-500/20 bg-indigo-500/6 text-[9px] uppercase tracking-wide text-indigo-300">
          {plugin.category}
        </Badge>
      </div>

      <p className="mt-3 min-h-10 text-[11px] leading-5 text-muted-foreground/78">
        {plugin.description ?? 'No description provided.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(plugin.tags.length > 0 ? plugin.tags : ['untagged']).map((tag) => (
          <span
            key={`${plugin.id}-${tag}`}
            className="rounded-full border border-border/40 bg-background/70 px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70"
          >
            {tag}
          </span>
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-[10px] text-muted-foreground/65">
        <div className="flex items-start justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Version</dt>
          <dd className="font-mono text-foreground/75">{plugin.version ?? 'unknown'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="uppercase tracking-[0.18em]">Installed from</dt>
          <dd className="break-all rounded-lg border border-border/35 bg-background/65 px-2 py-1.5 font-mono text-[10px] text-foreground/72">
            {plugin.source}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-[11px]"
          onClick={onReveal}
        >
          Reveal in Finder
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-destructive/30 text-[11px] text-destructive hover:bg-destructive/8"
          onClick={onUninstall}
          disabled={uninstalling}
        >
          {uninstalling ? 'Removing…' : 'Uninstall'}
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-indigo-400/65"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M12 22V12" />
          <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-foreground/80">No plugins installed yet</p>
      <p className="mt-2 max-w-md text-[11px] leading-5 text-muted-foreground/65">
        Install an optional Sero app from npm, git, or a local build bundle. Newly installed
        plugins appear in the sidebar immediately.
      </p>
    </div>
  );
}
