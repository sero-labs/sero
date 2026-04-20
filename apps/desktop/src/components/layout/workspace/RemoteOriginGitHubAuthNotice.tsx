import { cn } from '@sero-ai/ui/lib/utils';
import type { GitHubAuthStatus } from '@/types/electron-services';
import type { GitHubAuthDialogResult } from '@/stores/github-auth';
import { GitHubAuthOutcomeNote } from '@/components/layout/auth/github/GitHubAuthOutcomeNote';
import { GitHubAuthSummary } from '@/components/layout/auth/github/GitHubAuthSummary';

export type RemoteOriginGitHubAuthOutcome = Extract<
  GitHubAuthDialogResult,
  { outcome: 'cancelled' | 'error' }
>;

interface RemoteOriginGitHubAuthNoticeProps {
  authStatus: GitHubAuthStatus | null;
  statusReady: boolean;
  lastOutcome: RemoteOriginGitHubAuthOutcome | null;
  onConnect: () => void;
  className?: string;
}

export function RemoteOriginGitHubAuthNotice({
  authStatus,
  statusReady,
  lastOutcome,
  onConnect,
  className,
}: RemoteOriginGitHubAuthNoticeProps) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-[var(--status-info)]/20 bg-[var(--status-info)]/5 p-3',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">GitHub connection required</p>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          Connect GitHub to create this repository without leaving this form.
        </p>
      </div>

      <GitHubAuthSummary
        authStatus={authStatus}
        statusReady={statusReady}
        disconnectedCopy="GitHub needs to be connected before Sero can create this repository."
        onConnect={onConnect}
        className="bg-[var(--bg-base)]/70"
      />

      {!authStatus?.authenticated && lastOutcome ? (
        <GitHubAuthOutcomeNote
          outcome={lastOutcome.outcome}
          message={lastOutcome.outcome === 'error' ? lastOutcome.message : undefined}
          onRetry={onConnect}
        />
      ) : null}
    </div>
  );
}
