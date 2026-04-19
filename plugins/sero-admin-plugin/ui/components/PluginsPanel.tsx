import { memo, useMemo, useState } from 'react';
import { useAppInfo } from '@sero-ai/app-runtime';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { cn } from '@sero-ai/ui/lib/utils';
import type { InstalledPlugin } from '@sero-ai/common';
import { usePlugins } from '../hooks/usePlugins';
import { useLinkedRoots } from '../hooks/useLinkedRoots';
import type { WorkspaceRootIPC } from '../hooks/host';

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
  const { workspaceId } = useAppInfo();
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
  const linked = useLinkedRoots(workspaceId);
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
            className="border-primary/20 bg-primary/5 text-[10px] text-primary"
          >
            {installedCountLabel}
          </Badge>
        </div>
      </div>

      <div className="border-b border-border/20 bg-secondary px-4 py-4">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/85">
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
              className="h-9 min-w-28 bg-primary text-xs font-medium hover:bg-primary/90"
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
                  'border-border/50 bg-background/70 text-muted-foreground hover:border-primary/30 hover:text-primary',
                )}
              >
                {example.label}: <span className="font-mono">{example.value}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <LinkedPluginsSection
        linkedPlugins={linked.linkedPlugins}
        busy={linked.busy}
        error={linked.error}
        onLink={linked.linkPlugin}
        onUnlink={linked.unlink}
        onReveal={linked.revealInFinder}
      />

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
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)] backdrop-blur-sm transition-colors hover:border-primary/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {plugin.name.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground/90">{plugin.name}</h3>
                {plugin.hasUI ? (
                  <Badge variant="outline" className="h-5 border-primary/20 bg-primary/5 px-1.5 text-[9px] text-primary">
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

        <Badge variant="outline" className="border-primary/20 bg-primary/6 text-[9px] uppercase tracking-wide text-primary">
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

function LinkedPluginsSection({
  linkedPlugins,
  busy,
  error,
  onLink,
  onUnlink,
  onReveal,
}: {
  linkedPlugins: WorkspaceRootIPC[];
  busy: boolean;
  error: string | null;
  onLink: () => Promise<boolean>;
  onUnlink: (rootId: string) => Promise<void>;
  onReveal: (path: string) => Promise<void>;
}) {
  return (
    <div className="border-b border-border/20 bg-background/40 px-4 py-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/85">
              Linked plugin folders
            </p>
            <p className="max-w-3xl text-[11px] leading-5 text-muted-foreground/75">
              Link a local plugin source folder to develop it inside Sero. The folder appears as
              an extra root in the explorer for this workspace and is bind-mounted into its
              container so the agent can edit it directly.
            </p>
          </div>
          <Button
            onClick={() => { void onLink(); }}
            disabled={busy}
            variant="outline"
            className="h-9 min-w-32 text-xs font-medium"
          >
            {busy ? 'Working…' : 'Link plugin folder'}
          </Button>
        </div>

        {error && (
          <p className="text-[11px] text-destructive">{error}</p>
        )}

        {linkedPlugins.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/65">
            No linked plugin folders. Click <strong>Link plugin folder</strong> and pick the
            checkout of a Sero plugin (e.g. <code>~/code/sero/plugins/sero-foo-plugin</code>).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linkedPlugins.map((root) => (
              <li
                key={root.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-foreground/85">{root.name}</span>
                    <Badge variant="outline" className="h-5 border-primary/20 bg-primary/5 px-1.5 text-[9px] text-primary">
                      linked
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-[10px] text-muted-foreground/65">{root.path}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => { void onReveal(root.path); }}
                  >
                    Reveal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-destructive/30 px-2 text-[10px] text-destructive hover:bg-destructive/8"
                    onClick={() => { void onUnlink(root.id); }}
                    disabled={busy}
                  >
                    Unlink
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary/65"
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
