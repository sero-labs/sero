import { memo, useMemo, useState } from 'react';
import { FolderOpen, Link2, Loader2, PackagePlus, PlugZap, Trash2 } from 'lucide-react';
import { useAppInfo } from '@sero-ai/app-runtime';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { cn } from '@sero-ai/ui/lib/utils';
import type { InstalledPlugin, PluginCategory } from '@sero-ai/common';
import { usePlugins } from '../hooks/usePlugins';
import { useLinkedRoots } from '../hooks/useLinkedRoots';
import { getSero, type WorkspaceRootIPC } from '../hooks/host';

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

const CATEGORY_ACCENTS: Record<PluginCategory, { icon: string; badge: string }> = {
  productivity: {
    icon: 'border-[var(--status-success-border)] bg-[var(--status-success-muted)] text-[var(--status-success)]',
    badge: 'border-[var(--status-success-border)] bg-[var(--status-success-muted)] text-[var(--status-success)]',
  },
  'developer-tools': {
    icon: 'border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[var(--status-info)]',
    badge: 'border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[var(--status-info)]',
  },
  entertainment: {
    icon: 'border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[var(--collab-primary)]',
    badge: 'border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[var(--collab-primary)]',
  },
  integrations: {
    icon: 'border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]',
    badge: 'border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]',
  },
  finance: {
    icon: 'border-[var(--status-warning-border)] bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
    badge: 'border-[var(--status-warning-border)] bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
  },
  health: {
    icon: 'border-[var(--status-success-border)] bg-[var(--status-success-muted)] text-[var(--status-success)]',
    badge: 'border-[var(--status-success-border)] bg-[var(--status-success-muted)] text-[var(--status-success)]',
  },
  creative: {
    icon: 'border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[var(--collab-primary)]',
    badge: 'border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[var(--collab-primary)]',
  },
  utilities: {
    icon: 'border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-secondary)]',
    badge: 'border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-secondary)]',
  },
};

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
  const [pickingLocalInstall, setPickingLocalInstall] = useState(false);

  const installedCountLabel = useMemo(() => {
    return plugins.length === 1 ? '1 installed plugin' : `${plugins.length} installed plugins`;
  }, [plugins.length]);

  const handleInstall = async () => {
    const source = installSource.trim();
    if (!source) return;
    const installed = await install(source);
    if (installed) {
      setInstallSource('');
    }
  };
  const handleBrowseLocalInstall = async () => {
    setPickingLocalInstall(true);
    try {
      const folder = await getSero().workspace.pickFolder();
      if (folder) setInstallSource(folder);
    } catch (err) {
      console.error('[admin] Failed to pick local plugin folder:', err);
    } finally {
      setPickingLocalInstall(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]">
              <PlugZap className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Plugin Manager</h2>
              <p className="max-w-3xl text-[11px] leading-5 text-[var(--text-muted)]">
                Install optional Sero apps from npm, git, or a built local bundle.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[10px] text-[var(--banner-primary)]"
          >
            {installedCountLabel}
          </Badge>
        </div>
      </div>

      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg border border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[var(--status-info)]">
              <PackagePlus className="size-3.5" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Install from source
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleInstall();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="flex-1 space-y-1.5">
                <label
                  htmlFor="plugin-install-source"
                  className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]"
                >
                  Package / git URL / local dist path
                </label>
                <div className="relative">
                  <PackagePlus className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--banner-primary)]" />
                  <Input
                    id="plugin-install-source"
                    value={installSource}
                    onChange={(event) => setInstallSource(event.target.value)}
                    placeholder="npm:@sero/plugin-my-app@latest or /absolute/path/to/dist/plugin"
                    className="h-11 rounded-xl border-[var(--banner-primary-border)] bg-[var(--bg-base)] pl-10 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/75 focus-visible:border-[var(--border-focus)] focus-visible:ring-[var(--banner-primary-muted)]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={installing || pickingLocalInstall}
                  onClick={() => { void handleBrowseLocalInstall(); }}
                  className="h-11 border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                >
                  <FolderOpen className="size-3.5 text-[var(--banner-primary)]" />
                  {pickingLocalInstall ? 'Browsing…' : 'Browse local'}
                </Button>
                <Button
                  type="submit"
                  disabled={installing || !installSource.trim()}
                  className="h-11 min-w-32 bg-[var(--banner-primary)] px-4 text-xs font-medium text-white hover:bg-[var(--banner-primary)]/85"
                >
                  {installing ? 'Installing…' : 'Install Plugin'}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]">
              <div className="flex min-w-max items-center gap-1.5 px-2.5 py-2.5">
                <p className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Examples
                </p>
                {INSTALL_EXAMPLES.map((example) => (
                  <div
                    key={example.label}
                    className={cn(
                      'inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[10px] leading-none',
                      'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                    )}
                  >
                    <span className="mr-1 text-[var(--text-muted)]">{example.label}:</span>
                    <span className="select-all font-mono text-[var(--text-primary)]/85">
                      {example.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </form>
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
        <div className="border-b border-[var(--status-error-border)] bg-[var(--status-error-faint)] px-4 py-2">
          <p className="text-[11px] text-[var(--status-error)]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="admin-loading text-xs text-[var(--text-muted)]">Loading plugins…</div>
        </div>
      ) : plugins.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div
            className="grid justify-center gap-4 p-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 23rem), 23rem))' }}
          >
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
  const accent = CATEGORY_ACCENTS[plugin.category] ?? CATEGORY_ACCENTS.utilities;
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)] transition-colors hover:border-[var(--banner-primary-border)] hover:bg-[var(--bg-elevated)]/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-semibold uppercase tracking-[0.18em]',
                accent.icon,
              )}
            >
              {plugin.name.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {plugin.name}
                </h3>
                {plugin.hasUI ? (
                  <Badge
                    variant="outline"
                    className="h-5 border-[var(--status-info-border)] bg-[var(--status-info-muted)] px-1.5 text-[9px] text-[var(--status-info)]"
                  >
                    UI
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-5 border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 text-[9px] text-[var(--text-muted)]"
                  >
                    Tool-only
                  </Badge>
                )}
              </div>
              <p className="truncate text-[11px] text-[var(--text-muted)]">{plugin.id}</p>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn('text-[9px] uppercase tracking-[0.18em]', accent.badge)}
        >
          {plugin.category}
        </Badge>
      </div>

      <p className="mt-4 min-h-[3.5rem] text-[11px] leading-5 text-[var(--text-secondary)]">
        {plugin.description ?? 'No description provided.'}
      </p>

      <div className="mt-3 flex min-h-8 flex-wrap gap-1.5">
        {(plugin.tags.length > 0 ? plugin.tags : ['untagged']).map((tag) => (
          <span
            key={`${plugin.id}-${tag}`}
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[9px] uppercase tracking-wide leading-none text-[var(--text-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <dl className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-4 text-[10px] text-[var(--text-muted)]">
        <div className="flex items-start justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Version</dt>
          <dd className="font-mono text-[var(--text-primary)]/80">{plugin.version ?? 'unknown'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="uppercase tracking-[0.18em]">Location</dt>
          <dd
            title={plugin.source}
            className="truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-2 font-mono text-[10px] text-[var(--text-secondary)]"
          >
            {plugin.source}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 border-[var(--border-subtle)] bg-[var(--bg-base)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          onClick={onReveal}
        >
          <FolderOpen className="size-3.5 text-[var(--banner-primary)]" />
          Reveal in Finder
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={uninstalling ? `Removing ${plugin.name}` : `Uninstall ${plugin.name}`}
          title={uninstalling ? 'Removing…' : 'Uninstall'}
          className="size-8 rounded-lg border-[var(--status-error-border)] bg-[var(--status-error-muted)] text-[var(--status-error)] hover:bg-[var(--status-error-subtle)]"
          onClick={onUninstall}
          disabled={uninstalling}
        >
          {uninstalling ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
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
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg border border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[var(--collab-primary)]">
                <Link2 className="size-3.5" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                Linked plugin folders
              </p>
            </div>
            <p className="max-w-3xl text-[11px] leading-5 text-[var(--text-muted)]">
              Link a local plugin source folder to develop it inside Sero. The folder appears as
              an extra root in the explorer for this workspace and is bind-mounted into its
              container so the agent can edit it directly.
            </p>
          </div>
          <Button
            onClick={() => { void onLink(); }}
            disabled={busy}
            variant="outline"
            className="h-9 min-w-32 border-[var(--border-default)] bg-[var(--bg-base)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          >
            {busy ? 'Working…' : 'Link plugin folder'}
          </Button>
        </div>

        {error && (
          <p className="text-[11px] text-[var(--status-error)]">{error}</p>
        )}

        {linkedPlugins.length === 0 ? (
          <p className="text-[11px] leading-5 text-[var(--text-muted)]">No linked plugins</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linkedPlugins.map((root) => (
              <li
                key={root.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 transition-colors hover:border-[var(--banner-primary-border)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {root.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="h-5 border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] px-1.5 text-[9px] text-[var(--banner-primary)]"
                    >
                      linked
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                    {root.path}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-[var(--border-subtle)] px-2 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                    onClick={() => { void onReveal(root.path); }}
                  >
                    Reveal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-[var(--status-error-border)] bg-[var(--status-error-muted)] px-2 text-[10px] text-[var(--status-error)] hover:bg-[var(--status-error-subtle)]"
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M12 22V12" />
          <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">No plugins installed yet</p>
      <p className="mt-2 max-w-md text-[11px] leading-5 text-[var(--text-muted)]">
        Install an optional Sero app from npm, git, or a local build bundle. Newly installed
        plugins appear in the sidebar immediately.
      </p>
    </div>
  );
}
