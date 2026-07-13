import { useState } from 'react';
import {
  Download,
  Loader2,
  Star,
  Github,
  Package,
  Trash2,
} from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { DiscoveredPlugin } from '@/types/ipc';

interface DiscoverPluginCardProps {
  plugin: DiscoveredPlugin;
  onInstall: (plugin: DiscoveredPlugin) => Promise<void>;
  onUninstall: (plugin: DiscoveredPlugin) => Promise<void>;
}

export function DiscoverPluginCard({
  plugin,
  onInstall,
  onUninstall,
}: DiscoverPluginCardProps) {
  const [pendingAction, setPendingAction] = useState<'install' | 'uninstall' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setPendingAction('install');
    setError(null);
    try {
      await onInstall(plugin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setPendingAction(null);
    }
  };

  const handleUninstall = async () => {
    setPendingAction('uninstall');
    setError(null);
    try {
      await onUninstall(plugin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uninstall failed');
    } finally {
      setPendingAction(null);
    }
  };

  const isInstalling = pendingAction === 'install';
  const isUninstalling = pendingAction === 'uninstall';

  return (
    <div
      className={cn(
        'group rounded-xl border p-3 text-left transition-colors',
        plugin.installed
          ? 'border-status-success-border bg-status-success-faint hover:bg-status-success-subtle'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
            plugin.installed
              ? 'bg-status-success-muted text-status-success'
              : 'bg-[var(--bg-base)] text-[var(--text-secondary)]',
          )}
        >
          <Package className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-medium text-[var(--text-primary)]">
              {plugin.displayName}
            </span>
            {plugin.version ? (
              <span className="shrink-0 text-sm text-[var(--text-muted)]">
                v{plugin.version}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[var(--text-muted)]">{plugin.author}</p>
        </div>

      </div>

      <p className="mt-3 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
        {plugin.description || 'No description available.'}
      </p>

      {error ? <p className="mt-1 text-xs text-status-error">{error}</p> : null}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {plugin.stars > 0 ? (
            <Badge
              variant="outline"
              className="gap-1 border-[var(--border-default)] text-sm text-[var(--text-muted)]"
            >
              <Star className="size-3" />
              {plugin.stars}
            </Badge>
          ) : null}
          {plugin.npmPackage ? (
            <Badge
              variant="outline"
              className="gap-1 border-status-error-border bg-status-error-muted text-sm text-status-error"
            >
              <Package className="size-3" />
              npm
            </Badge>
          ) : null}
          {plugin.githubUrl ? (
            <Badge
              variant="outline"
              className="gap-1 border-[var(--border-default)] text-sm text-[var(--text-muted)]"
            >
              <Github className="size-3" />
              GitHub
            </Badge>
          ) : null}
        </div>

        {plugin.installed ? (
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={`Uninstall ${plugin.displayName}`}
            disabled={isUninstalling}
            onClick={handleUninstall}
            className="size-7 shrink-0 border-status-error-border bg-status-error-muted text-status-error hover:bg-status-error-subtle"
          >
            {isUninstalling ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isInstalling}
            onClick={handleInstall}
            className="h-7 shrink-0 border-status-success-border bg-status-success-muted px-2.5 text-status-success hover:bg-status-success-subtle"
          >
            {isInstalling ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            Install
          </Button>
        )}
      </div>
    </div>
  );
}
