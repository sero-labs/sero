import { Github } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { GitHubAuthStatus } from '@/types/electron-services';
import { GitHubAuthOutcomeNote } from '@/components/layout/auth/github/GitHubAuthOutcomeNote';
import { GitHubAuthSummary } from '@/components/layout/auth/github/GitHubAuthSummary';
import type { GitHubAuthDialogResult } from '@/stores/github-auth';

type GitHubConnectCardOutcome = Extract<GitHubAuthDialogResult, { outcome: 'cancelled' | 'error' }>;

interface GitHubConnectCardProps {
  authStatus: GitHubAuthStatus | null;
  statusReady: boolean;
  lastOutcome: GitHubConnectCardOutcome | null;
  onConnect: () => void;
}

export function GitHubConnectCard({
  authStatus,
  statusReady,
  lastOutcome,
  onConnect,
}: GitHubConnectCardProps) {
  const connected = Boolean(authStatus?.authenticated);

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        connected
          ? 'border-status-success/20 bg-status-success/5'
          : 'border-status-info/20 bg-status-info/5',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            connected ? 'bg-status-success-muted/70' : 'bg-[var(--bg-elevated)]',
          )}
        >
          <Github
            className={cn(
              'size-4',
              connected ? 'text-status-success' : 'text-[var(--text-primary)]',
            )}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-[var(--text-primary)]">Connect GitHub</p>
              <span className="rounded-full border border-status-warning/25 bg-status-warning/10 px-2 py-0.5 text-sm font-medium uppercase tracking-wide text-status-warning">
                Recommended
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Connect now to enable clone, push, fetch, and pull request workflows in Sero. You
              can continue setup without it and connect later when a GitHub task needs it.
            </p>
          </div>

          <GitHubAuthSummary
            authStatus={authStatus}
            statusReady={statusReady}
            disconnectedCopy="Connect GitHub to enable repo workflows in Sero."
            onConnect={onConnect}
            className="bg-[var(--bg-base)]/70"
          />

          {!connected && lastOutcome ? (
            <GitHubAuthOutcomeNote
              outcome={lastOutcome.outcome}
              message={lastOutcome.outcome === 'error' ? lastOutcome.message : undefined}
              onRetry={onConnect}
            />
          ) : null}

          <p className="text-sm text-[var(--text-muted)]">
            {connected
              ? "GitHub is ready. Continue to memory setup when you're ready."
              : 'Optional for onboarding, but helpful if you work with repositories.'}
          </p>
        </div>
      </div>
    </div>
  );
}
