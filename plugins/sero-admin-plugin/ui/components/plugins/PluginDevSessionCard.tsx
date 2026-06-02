import { memo } from 'react';
import { Code2, FolderOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { PluginDevSessionIPC } from '../../hooks/host';

const STATUS_META = {
  starting: {
    label: 'Starting',
    container: 'border-status-info-border bg-status-info-muted/20',
    icon: 'border-status-info-border bg-status-info-muted text-status-info',
    badge: 'border-status-info-border bg-status-info-muted text-status-info',
    description: 'Validating the plugin checkout and starting any available development services.',
  },
  active: {
    label: 'Active',
    container: 'border-status-success-border bg-status-success-muted/15',
    icon: 'border-status-success-border bg-status-success-muted text-status-success',
    badge: 'border-status-success-border bg-status-success-muted text-status-success',
    description: 'Running directly from the local checkout for the active profile.',
  },
  'needs-attention': {
    label: 'Needs attention',
    container: 'border-status-warning-border bg-status-warning-muted/20',
    icon: 'border-status-warning-border bg-status-warning-muted text-status-warning',
    badge: 'border-status-warning-border bg-status-warning-muted text-status-warning',
    description: 'Sero kept this session available where possible, but the last refresh needs review.',
  },
  broken: {
    label: 'Broken',
    container: 'border-status-error-border bg-status-error-faint',
    icon: 'border-status-error-border bg-status-error-muted text-status-error',
    badge: 'border-status-error-border bg-status-error-muted text-status-error',
    description: 'Saved for recovery, but not currently active. Fix the folder and retry, or remove it.',
  },
} as const;

const UI_MODE_META = {
  'dev-server': {
    label: 'Live UI dev server',
    badge: 'border-status-info-border bg-status-info-muted text-status-info',
    description: 'Using the managed local UI dev server for this session.',
  },
  'built-fallback': {
    label: 'Built UI fallback',
    badge: 'border-status-success-border bg-status-success-muted text-status-success',
    description: 'Using built UI assets from the checkout because live UI was unavailable.',
  },
  'backend-only': {
    label: 'Backend only',
    badge: 'border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-secondary)]',
    description: 'This plugin exposes backend behavior only and does not declare a UI surface.',
  },
  unavailable: {
    label: 'UI unavailable',
    badge: 'border-status-warning-border bg-status-warning-muted text-status-warning',
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
    <article className={cn('flex h-full flex-col rounded-2xl border p-4 shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)]', status.container)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={cn('mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border', status.icon)}>
            <Code2 className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">{displayName}</h4>
              <Badge variant="outline" className={cn('text-[9px] uppercase tracking-[0.18em]', status.badge)}>
                {status.label}
              </Badge>
              <Badge variant="outline" className={cn('text-[9px] uppercase tracking-[0.18em]', uiMode.badge)}>
                {uiMode.label}
              </Badge>
            </div>
            <p className="text-[11px] leading-5 text-[var(--text-secondary)]">{status.description}</p>
          </div>
        </div>
      </div>

      <dl className="mt-4 space-y-3 text-[10px] text-[var(--text-muted)]">
        <div className="space-y-1">
          <dt className="uppercase tracking-[0.18em]">App ID</dt>
          <dd className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-2 font-mono text-[10px] text-[var(--text-secondary)]">
            {session.appId ?? 'Awaiting a valid plugin manifest'}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="uppercase tracking-[0.18em]">Source folder</dt>
          <dd
            title={session.sourcePath}
            className="truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-2 font-mono text-[10px] text-[var(--text-secondary)]"
          >
            {session.sourcePath}
          </dd>
        </div>

        {session.remoteEntryOverride ? (
          <div className="space-y-1">
            <dt className="uppercase tracking-[0.18em]">Remote entry override</dt>
            <dd
              title={session.remoteEntryOverride}
              className="truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-2 font-mono text-[10px] text-[var(--text-secondary)]"
            >
              {session.remoteEntryOverride}
            </dd>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5">
            <dt className="uppercase tracking-[0.18em]">UI mode</dt>
            <dd className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{uiMode.description}</dd>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5">
            <dt className="uppercase tracking-[0.18em]">Updated</dt>
            <dd className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{formatUpdatedAt(session.updatedAt)}</dd>
          </div>
        </div>
      </dl>

      {session.lastError ? (
        <div className="mt-4 rounded-xl border border-status-error-border bg-status-error-faint p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-status-error">Last error</p>
          <p className="mt-1 text-[11px] leading-5 text-status-error">{session.lastError}</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing || stopping}
          className="h-8 border-status-info-border bg-status-info-muted text-[11px] text-status-info hover:bg-status-info-subtle"
          onClick={onRefresh}
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {refreshing ? 'Refreshing...' : refreshLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={stopping}
          className="h-8 border-[var(--border-subtle)] bg-[var(--bg-base)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          onClick={onReveal}
        >
          <FolderOpen className="size-3.5 text-[var(--banner-primary)]" />
          Reveal folder
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing || stopping}
          className="h-8 border-status-error-border bg-status-error-muted text-[11px] text-status-error hover:bg-status-error-subtle"
          onClick={onStop}
        >
          {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          {stopping ? `${stopLabel}...` : stopLabel}
        </Button>
      </div>
    </article>
  );
});
