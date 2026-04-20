import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGitHubAuthStore } from '@/stores/github-auth';

export type { GitHubFlowState } from '@/stores/github-auth';

export function useGitHubAuthFlow() {
  const githubAuth = useGitHubAuthStore(
    useShallow((state) => ({
      authStatus: state.authStatus,
      statusReady: state.statusReady,
      flow: state.flow,
      copied: state.copied,
      copyFailed: state.copyFailed,
      init: state.init,
      startLogin: state.startLogin,
      logout: state.logout,
      cancel: state.cancel,
      copyCode: state.copyCode,
      refreshStatus: state.refreshStatus,
    })),
  );

  useEffect(() => {
    void githubAuth.init();
  }, [githubAuth.init]);

  return {
    authStatus: githubAuth.authStatus,
    statusReady: githubAuth.statusReady,
    flow: githubAuth.flow,
    copied: githubAuth.copied,
    copyFailed: githubAuth.copyFailed,
    startLogin: githubAuth.startLogin,
    logout: githubAuth.logout,
    cancel: githubAuth.cancel,
    copyCode: githubAuth.copyCode,
    refreshStatus: githubAuth.refreshStatus,
  };
}
