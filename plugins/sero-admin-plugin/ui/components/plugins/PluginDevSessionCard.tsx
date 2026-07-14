import { memo } from 'react';
import { Code2, FolderOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { PluginDevSessionIPC } from '../../hooks/host';

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground/70">{label}</dt>
      <dd
        title={mono ? value : undefined}
        className={cn('min-w-0 flex-1 text-foreground/75', mono ? 'truncate font-mono' : 'text-muted-foreground')}
      >
        {value}
      </dd>
    </div>
  );
}

const STATUS_META = {
  starting: {
    label: 'Starting',
    badge: 'border-primary/30 bg-primary/10 text-primary',
    description: 'Validating the plugin checkout and starting any available development services.',
  },
  active: {
    label: 'Active',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    description: 'Running directly from the local checkout for the active profile.',
  },
  'needs-attention': {
    label: 'Needs attention',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    description: 'Sero kept this session available where possible, but the last refresh needs review.',
  },
  broken: {
    label: 'Broken',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    description: 'Saved for recovery, but not currently active. Fix the folder and retry, or remove it.',
  },
} as const;

const UI_MODE_META = {
  'dev-server': {
    label: 'Live UI dev server',
    description: 'Using the managed local UI dev server for this session.',
  },
  'built-fallback': {
    label: 'Built UI fallback',
    description: 'Using built UI assets from the checkout because live UI was unavailable.',
  },
  'backend-only': {
    label: 'Backend only',
    description: 'This plugin exposes backend behavior only and does not declare a UI surface.',
  },
  unavailable: {
    label: 'UI unavailable',
    description: 'The session is active where possible, but no UI surface is currently available.',
  },
} as const;

interface PluginDevSessionCardProps {
  session: PluginDevSessionIPC;
  refreshing: boolean;
  stopping: boolean;
  onRefresh: () => void;
  onStop: () => void;
  onReveal: () => void;
}

function getPathLeaf(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? sourcePath;
}

function getDisplayName(session: PluginDevSessionIPC): string {
  return session.name?.trim() || session.appId || getPathLeaf(session.sourcePath);
}

function formatUpdatedAt(updatedAt: string): string {
  const timestamp = new Date(updatedAt);
  return Number.isNaN(timestamp.getTime()) ? updatedAt : timestamp.toLocaleString();
}

export const PluginDevSessionCard = memo(function PluginDevSessionCard({
  session,
  refreshing,
  stopping,
  onRefresh,
  onStop,
  onReveal,
}: PluginDevSessionCardProps) {
  const status = STATUS_META[session.status];
  const uiMode = UI_MODE_META[session.uiMode];
  const displayName = getDisplayName(session);
  const refreshLabel = session.status === 'broken' || session.status === 'needs-attention'
    ? 'Retry'
    : 'Refresh';
  const stopLabel = session.status === 'broken' ? 'Remove' : 'Stop';

  return (
    <article className="flex h-full flex-col rounded-lg border border-border/40 bg-background/40 p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/40 text-muted-foreground">
          <Code2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-sm font-medium text-foreground">{displayName}</h4>
            <Badge variant="outline" className={cn('px-1.5 py-0 text-xs', status.badge)}>
              {status.label}
            </Badge>
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              {uiMode.label}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{status.description}</p>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        <DetailRow label="App ID" value={session.appId ?? 'Awaiting a valid plugin manifest'} mono />
        <DetailRow label="Source" value={session.sourcePath} mono />
        {session.remoteEntryOverride ? (
          <DetailRow label="Remote entry" value={session.remoteEntryOverride} mono />
        ) : null}
        <DetailRow label="UI mode" value={uiMode.description} />
        <DetailRow label="Updated" value={formatUpdatedAt(session.updatedAt)} />
      </dl>

      {session.lastError ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2.5">
          <p className="text-xs font-medium text-destructive">Last error</p>
          <p className="mt-0.5 text-xs leading-relaxed text-destructive/90">{session.lastError}</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing || stopping}
          className="h-8 text-sm"
          onClick={onRefresh}
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {refreshing ? 'Refreshing...' : refreshLabel}
        </Button>
        <Button variant="outline" size="sm" disabled={stopping} className="h-8 text-sm" onClick={onReveal}>
          <FolderOpen className="size-3.5" />
          Reveal folder
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing || stopping}
          className="h-8 text-sm border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onStop}
        >
          {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          {stopping ? `${stopLabel}...` : stopLabel}
        </Button>
      </div>
    </article>
  );
});
