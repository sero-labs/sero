import { useState } from 'react';
import { Download, Check, Loader2, Star, Github, Package } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { DiscoveredPlugin } from '@/types/ipc';

interface DiscoverPluginCardProps {
  key?: string;
  plugin: DiscoveredPlugin;
  onInstall: (plugin: DiscoveredPlugin) => Promise<void>;
}

export function DiscoverPluginCard({ plugin, onInstall }: DiscoverPluginCardProps) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(plugin.installed);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await onInstall(plugin);
      setInstalled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="group rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:bg-[var(--bg-elevated)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-base)] text-[var(--text-secondary)]">
          <Package className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">
              {plugin.displayName}
            </span>
            {plugin.version ? (
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                v{plugin.version}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {plugin.author}
          </p>
        </div>

        {installed ? (
          <Button type="button" variant="ghost" size="icon-sm" disabled>
            <Check className="size-4 text-[var(--status-success)]" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Install ${plugin.displayName}`}
            disabled={installing}
            onClick={handleInstall}
          >
            {installing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4 text-[var(--text-muted)]" />
            )}
          </Button>
        )}
      </div>

      <p className="mt-3 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
        {plugin.description || 'No description available.'}
      </p>

      {error ? (
        <p className="mt-1 text-xs text-[var(--status-error)]">{error}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {plugin.stars > 0 ? (
          <Badge
            variant="outline"
            className="gap-1 text-[11px] border-[var(--border-default)] text-[var(--text-muted)]"
          >
            <Star className="size-3" />
            {plugin.stars}
          </Badge>
        ) : null}
        {plugin.npmPackage ? (
          <Badge
            variant="outline"
            className="gap-1 text-[11px] border-[var(--status-error-border)] bg-[var(--status-error-muted)] text-[var(--status-error)]"
          >
            <Package className="size-3" />
            npm
          </Badge>
        ) : null}
        {plugin.githubUrl ? (
          <Badge
            variant="outline"
            className="gap-1 text-[11px] border-[var(--border-default)] text-[var(--text-muted)]"
          >
            <Github className="size-3" />
            GitHub
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
