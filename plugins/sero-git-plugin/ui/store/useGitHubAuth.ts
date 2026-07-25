/**
 * GitHub sign-in state, read from the host.
 *
 * Signing in belongs to the host (it owns the device flow and the token); the
 * Git app only needs to know whether it has happened, and to be able to start
 * it from the top bar.
 */

import { useCallback, useEffect, useState } from 'react';
import { seroGitHub } from './sero-bridge';

export interface GitHubAuth {
  ready: boolean;
  authenticated: boolean;
  username?: string;
  signIn: () => void;
}

export function useGitHubAuth(): GitHubAuth {
  const [state, setState] = useState<{ ready: boolean; authenticated: boolean; username?: string }>({
    ready: false,
    authenticated: false,
  });

  const refresh = useCallback(async () => {
    const github = seroGitHub();
    if (!github) {
      setState({ ready: true, authenticated: false });
      return;
    }
    try {
      const status = await github.status();
      setState({ ready: true, authenticated: status.authenticated, username: status.username });
    } catch {
      setState({ ready: true, authenticated: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The device flow finishes outside this app, so re-read when it reports in.
    return seroGitHub()?.onEvent((event) => {
      if (event.type === 'success' || event.type === 'error') void refresh();
    });
  }, [refresh]);

  const signIn = useCallback(() => {
    void seroGitHub()?.login();
  }, []);

  return { ...state, signIn };
}
