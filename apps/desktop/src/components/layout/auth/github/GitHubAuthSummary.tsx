import { Github, Loader2 } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { GitHubAuthStatus } from '@/types/electron-services';

export interface GitHubAuthSummaryProps {
  authStatus: GitHubAuthStatus | null;
  statusReady?: boolean;
  disconnectedCopy: string;
  onConnect: () => void;
  onDisconnect?: () => void;
  connectLabel?: string;
  disconnectLabel?: string;
  className?: string;
  variant?: 'compact';
}

export function GitHubAuthSummary({
  authStatus,
  statusReady = true,
  disconnectedCopy,
  onConnect,
  onDisconnect,
  connectLabel = 'Connect GitHub',
  disconnectLabel = 'Disconnect',
  className,
}: GitHubAuthSummaryProps) {
  if (!statusReady) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-1.5 text-sm text-[var(--text-muted)]',
          className,
        )}
      >
        <Loader2 className="size-3 animate-spin" />
        <span>Checking GitHub status…</span>
      </div>
    );
  }

  if (authStatus?.authenticated) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-1.5',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-status-success">
          <Github className="size-3 shrink-0" />
          <span className="truncate">
            Connected as <strong>{authStatus.username ?? 'GitHub user'}</strong>
          </span>
        </span>

        {onDisconnect ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="shrink-0 text-sm text-[var(--text-muted)] transition-colors hover:text-status-error"
          >
            {disconnectLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-2',
        className,
      )}
    >
      <span className="min-w-0 flex-1 text-sm text-[var(--text-muted)]">{disconnectedCopy}</span>
      <button
        type="button"
        onClick={onConnect}
        className={cn(
          'shrink-0 rounded px-2 py-0.5 text-sm font-medium',
          'bg-[var(--bg-muted)] text-[var(--text-secondary)]',
          'transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
        )}
      >
        <span className="flex items-center gap-1">
          <Github className="size-3" />
          {connectLabel}
        </span>
      </button>
    </div>
  );
}
