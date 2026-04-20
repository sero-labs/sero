import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@sero-ai/ui/lib/utils';
import type { GitHubAuthDialogResult } from '@/stores/github-auth';
import { useGitHubAuthStore } from '@/stores/github-auth';
import { GitHubAuthOutcomeNote } from '@/components/layout/auth/github/GitHubAuthOutcomeNote';
import { GitHubAuthSummary } from '@/components/layout/auth/github/GitHubAuthSummary';

interface Props {
  className?: string;
}

type InlineOutcome = Extract<GitHubAuthDialogResult, { outcome: 'cancelled' | 'error' }>;

export function GitHubAuthBanner({ className }: Props) {
  const {
    authStatus,
    statusReady,
    init,
    openGitHubAuthDialog,
    logout,
  } = useGitHubAuthStore(
    useShallow((state) => ({
      authStatus: state.authStatus,
      statusReady: state.statusReady,
      init: state.init,
      openGitHubAuthDialog: state.openGitHubAuthDialog,
      logout: state.logout,
    })),
  );
  const [lastOutcome, setLastOutcome] = useState<InlineOutcome | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (authStatus?.authenticated) {
      setLastOutcome(null);
    }
  }, [authStatus?.authenticated]);

  const handleConnect = useCallback(async () => {
    setLastOutcome(null);
    const result = await openGitHubAuthDialog({ source: 'explorer' });
    if (result.outcome === 'success') return;
    setLastOutcome(result);
  }, [openGitHubAuthDialog]);

  const handleDisconnect = useCallback(() => {
    setLastOutcome(null);
    void logout();
  }, [logout]);

  return (
    <div className={cn('space-y-1.5', className)}>
      <GitHubAuthSummary
        variant="compact"
        authStatus={authStatus}
        statusReady={statusReady}
        disconnectedCopy="Connect GitHub to push, fetch, and create PRs."
        onConnect={() => {
          void handleConnect();
        }}
        onDisconnect={handleDisconnect}
      />

      {!authStatus?.authenticated && lastOutcome ? (
        <GitHubAuthOutcomeNote
          outcome={lastOutcome.outcome}
          message={lastOutcome.outcome === 'error' ? lastOutcome.message : undefined}
          onRetry={() => {
            void handleConnect();
          }}
        />
      ) : null}
    </div>
  );
}
