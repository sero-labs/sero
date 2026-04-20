import { useCallback, useEffect, useMemo } from 'react';
import { Github } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type { GitHubAuthSource } from '@/stores/github-auth';
import { useGitHubAuthStore } from '@/stores/github-auth';
import {
  GitHubAuthCodeView,
  GitHubAuthConnectedView,
  GitHubAuthErrorView,
  GitHubAuthLoadingView,
  GitHubAuthPollingView,
  GitHubAuthReadyView,
} from './GitHubAuthDialogViews';

function describeGitHubAuthDialog(
  source: GitHubAuthSource | null,
  state: 'loading' | 'ready' | 'code' | 'polling' | 'connected' | 'error',
): string {
  if (state === 'loading') {
    return 'Checking your current GitHub status.';
  }

  if (state === 'code' || state === 'polling') {
    return 'Finish the GitHub device login in your browser to continue.';
  }

  if (state === 'connected') {
    return 'GitHub is connected and ready to use.';
  }

  if (state === 'error') {
    return 'GitHub login did not complete. Retry here or close the dialog to return.';
  }

  switch (source) {
    case 'explorer':
      return 'Connect GitHub once to use repo workflows directly from Explorer.';
    case 'onboarding':
      return 'Connect GitHub during setup, then continue onboarding from the same step.';
    case 'remote-origin':
      return 'Connect GitHub to create a remote repository for this workspace.';
    case 'publish':
      return 'Connect GitHub to create a repository and publish this workspace.';
    default:
      return 'Connect GitHub to use publishing, remote setup, and Explorer workflows.';
  }
}

export function GitHubAuthDialog() {
  const {
    open,
    activeRequest,
    authStatus,
    statusReady,
    flow,
    copied,
    copyFailed,
    init,
    startLogin,
    dismissGitHubAuthDialog,
    logout,
    copyCode,
  } = useGitHubAuthStore(
    useShallow((state) => ({
      open: state.open,
      activeRequest: state.activeRequest,
      authStatus: state.authStatus,
      statusReady: state.statusReady,
      flow: state.flow,
      copied: state.copied,
      copyFailed: state.copyFailed,
      init: state.init,
      startLogin: state.startLogin,
      dismissGitHubAuthDialog: state.dismissGitHubAuthDialog,
      logout: state.logout,
      copyCode: state.copyCode,
    })),
  );

  useEffect(() => {
    if (!open || statusReady) return;
    void init();
  }, [open, statusReady, init]);

  const handleDismiss = useCallback(() => {
    void dismissGitHubAuthDialog();
  }, [dismissGitHubAuthDialog]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleDismiss();
      }
    },
    [handleDismiss],
  );

  const dialogState = useMemo<'loading' | 'ready' | 'code' | 'polling' | 'connected' | 'error'>(() => {
    if (!statusReady) return 'loading';
    if (flow.step === 'error') return 'error';
    if (flow.step === 'code') return 'code';
    if (flow.step === 'polling') return 'polling';
    if (flow.step === 'success' || authStatus?.authenticated) return 'connected';
    return 'ready';
  }, [authStatus?.authenticated, flow.step, statusReady]);

  const connectedUsername = flow.step === 'success'
    ? flow.username || authStatus?.username || 'GitHub user'
    : authStatus?.username || 'GitHub user';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" />
            Connect GitHub
          </DialogTitle>
          <DialogDescription>
            {describeGitHubAuthDialog(activeRequest?.source ?? null, dialogState)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {dialogState === 'loading' ? (
            <GitHubAuthLoadingView onClose={handleDismiss} />
          ) : null}

          {dialogState === 'ready' ? (
            <GitHubAuthReadyView
              source={activeRequest?.source ?? null}
              onConnect={startLogin}
              onClose={handleDismiss}
            />
          ) : null}

          {dialogState === 'code' ? (
            <GitHubAuthCodeView
              userCode={flow.step === 'code' ? flow.userCode : ''}
              verificationUri={flow.step === 'code' ? flow.verificationUri : 'https://github.com/login/device'}
              copied={copied}
              copyFailed={copyFailed}
              onCopyCode={(code) => {
                void copyCode(code);
              }}
              onCancel={handleDismiss}
            />
          ) : null}

          {dialogState === 'polling' ? <GitHubAuthPollingView onCancel={handleDismiss} /> : null}

          {dialogState === 'connected' ? (
            <GitHubAuthConnectedView
              username={connectedUsername}
              onClose={handleDismiss}
              onLogout={() => {
                void logout();
              }}
            />
          ) : null}

          {dialogState === 'error' ? (
            <GitHubAuthErrorView
              message={flow.step === 'error' ? flow.message : 'GitHub login failed.'}
              onRetry={startLogin}
              onClose={handleDismiss}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
