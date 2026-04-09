import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitHubAuthStatus, GitHubDeviceFlowEvent } from '@/types/electron-services';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

export type GitHubFlowState =
  | { step: 'idle' }
  | { step: 'code'; userCode: string; verificationUri: string }
  | { step: 'polling' }
  | { step: 'success'; username: string }
  | { step: 'error'; message: string };

export function useGitHubAuthFlow() {
  const [authStatus, setAuthStatus] = useState<GitHubAuthStatus | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [flow, setFlow] = useState<GitHubFlowState>({ step: 'idle' });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void window.sero.github.status()
      .then((status) => {
        setAuthStatus(status);
        setStatusReady(true);
      })
      .catch(() => {
        setAuthStatus({ authenticated: false });
        setStatusReady(true);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = window.sero.github.onEvent((event) => {
      const nextEvent = event as GitHubDeviceFlowEvent;
      switch (nextEvent.type) {
        case 'code':
          setFlow({
            step: 'code',
            userCode: nextEvent.userCode ?? '',
            verificationUri: nextEvent.verificationUri ?? '',
          });
          break;
        case 'polling':
          setFlow((current) => (current.step === 'code' ? current : { step: 'polling' }));
          break;
        case 'success':
          setFlow({ step: 'success', username: nextEvent.username ?? '' });
          setAuthStatus({ authenticated: true, username: nextEvent.username });
          setStatusReady(true);
          break;
        case 'error':
          setFlow({ step: 'error', message: nextEvent.message ?? 'Login failed' });
          break;
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const startLogin = useCallback(() => {
    setFlow({ step: 'idle' });
    void window.sero.github.login();
  }, []);

  const logout = useCallback(() => {
    void window.sero.github.logout().then(() => {
      setAuthStatus({ authenticated: false });
      setFlow({ step: 'idle' });
    });
  }, []);

  const cancel = useCallback(() => {
    void window.sero.github.cancel();
    setFlow({ step: 'idle' });
  }, []);

  const copyCode = useCallback(async (code: string) => {
    const ok = await copyTextToClipboard(code);
    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }

    if (ok) {
      setCopied(true);
      setCopyFailed(false);
      copyResetTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyResetTimerRef.current = null;
      }, 2000);
      return;
    }

    setCopied(false);
    setCopyFailed(true);
    copyResetTimerRef.current = setTimeout(() => {
      setCopyFailed(false);
      copyResetTimerRef.current = null;
    }, 3000);
  }, []);

  return {
    authStatus,
    statusReady,
    flow,
    copied,
    copyFailed,
    startLogin,
    logout,
    cancel,
    copyCode,
  };
}
