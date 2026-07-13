import { memo, useState } from 'react';
import { FolderOpen, Loader2, PackagePlus, Trash2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';
import type { InstalledPlugin, PluginCategory } from '@sero-ai/common';
import { getSero } from '../../hooks/host';

const INSTALL_EXAMPLES = [
  { label: 'npm', value: 'npm:@sero/plugin-my-app@latest' },
  { label: 'git', value: 'git:https://github.com/user/sero-plugin-my-app.git' },
  { label: 'local', value: '/absolute/path/to/plugin/dist/plugin' },
] as const;

const CATEGORY_ACCENTS: Record<PluginCategory, { icon: string; badge: string }> = {
  productivity: {
    icon: 'border-status-success-border bg-status-success-muted text-status-success',
    badge: 'border-status-success-border bg-status-success-muted text-status-success',
  },
  'developer-tools': {
    icon: 'border-status-info-border bg-status-info-muted text-status-info',
    badge: 'border-status-info-border bg-status-info-muted text-status-info',
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
    icon: 'border-status-warning-border bg-status-warning-muted text-status-warning',
    badge: 'border-status-warning-border bg-status-warning-muted text-status-warning',
  },
  health: {
    icon: 'border-status-success-border bg-status-success-muted text-status-success',
    badge: 'border-status-success-border bg-status-success-muted text-status-success',
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

  const countLabel = plugins.length === 1 ? '1 installed plugin' : `${plugins.length} installed plugins`;

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
    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)]">
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]">
              <PackagePlus className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Installed Plugins</h3>
              <p className="max-w-3xl text-sm leading-5 text-[var(--text-muted)]">
                Managed plugin installs for this profile. Use installs for packaged releases from npm,
                git, or a built local bundle,local development sessions stay separate below.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-sm text-[var(--banner-primary)]"
          >
            {countLabel}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg border border-status-info-border bg-status-info-muted text-status-info">
            <PackagePlus className="size-3.5" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
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
                className="block text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]"
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
                onClick={() => {
                  void handleBrowseLocalInstall();
                }}
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
                {installing ? 'Installing…' : 'Install plugin'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]">
            <div className="flex min-w-max items-center gap-1.5 p-2.5">
              <p className="shrink-0 pr-1 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Examples
              </p>
              {INSTALL_EXAMPLES.map((example) => (
                <div
                  key={example.label}
                  className={cn(
                    'inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-sm leading-none',
                    'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                  )}
                >
                  <span className="mr-1 text-[var(--text-muted)]">{example.label}:</span>
                  <span className="select-all font-mono text-[var(--text-primary)]/85">{example.value}</span>
                </div>
              ))}
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-xl border border-status-error-border bg-status-error-faint px-3 py-2.5 text-sm text-status-error">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            Loading installed plugins…
          </div>
        ) : plugins.length === 0 ? (
          <InstalledPluginsEmptyState />
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 23rem), 23rem))' }}
          >
            {plugins.map((plugin) => (
              <InstalledPluginCard
                key={plugin.id}
                plugin={plugin}
                uninstalling={uninstallingIds.includes(plugin.id)}
                onReveal={() => {
                  void onReveal(plugin.packagePath);
                }}
                onUninstall={() => {
                  void onUninstall(plugin.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

function InstalledPluginCard({
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
    <div className="flex h-full flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4 transition-colors hover:border-[var(--banner-primary-border)] hover:bg-[var(--bg-elevated)]/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold uppercase tracking-[0.18em]',
                accent.icon,
              )}
            >
              {plugin.name.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate text-base font-semibold text-[var(--text-primary)]">{plugin.name}</h4>
                {plugin.hasUI ? (
                  <Badge
                    variant="outline"
                    className="h-5 border-status-info-border bg-status-info-muted px-1.5 text-xs text-status-info"
                  >
                    UI
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-5 border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 text-xs text-[var(--text-muted)]"
                  >
                    Tool-only
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-[var(--text-muted)]">{plugin.id}</p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className={cn('text-xs uppercase tracking-[0.18em]', accent.badge)}>
          {plugin.category}
        </Badge>
      </div>

      <p className="mt-4 min-h-[3.5rem] text-sm leading-5 text-[var(--text-secondary)]">
        {plugin.description ?? 'No description provided.'}
      </p>

      <div className="mt-3 flex min-h-8 flex-wrap gap-1.5">
        {(plugin.tags.length > 0 ? plugin.tags : ['untagged']).map((tag) => (
          <span
            key={`${plugin.id}-${tag}`}
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs uppercase tracking-wide leading-none text-[var(--text-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <dl className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--text-muted)]">
        <div className="flex items-start justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Version</dt>
          <dd className="font-mono text-[var(--text-primary)]/80">{plugin.version ?? 'unknown'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="uppercase tracking-[0.18em]">Location</dt>
          <dd
            title={plugin.source}
            className="truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 font-mono text-sm text-[var(--text-secondary)]"
          >
            {plugin.source}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
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
          className="size-8 rounded-lg border-status-error-border bg-status-error-muted text-status-error hover:bg-status-error-subtle"
          onClick={onUninstall}
          disabled={uninstalling}
        >
          {uninstalling ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function InstalledPluginsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-base)] px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]">
        <PackagePlus className="size-6" />
      </div>
      <p className="mt-4 text-base font-medium text-[var(--text-primary)]">No installed plugins yet</p>
      <p className="mt-2 max-w-md text-sm leading-5 text-[var(--text-muted)]">
        Install an optional Sero app from npm, git, or a local build bundle. Installed plugins
        appear in the sidebar immediately and remain distinct from local development sessions.
      </p>
    </div>
  );
}
