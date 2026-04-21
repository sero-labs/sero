import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

const MCP_AUTO_REFRESH_INTERVAL_MS = 30_000;

interface BootstrapState {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMcpBootstrap(): BootstrapState {
  const { run } = useAppTools();
  const didBootstrapRef = useRef(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runRefresh = useCallback(async (options: { action?: 'bootstrap' | 'refresh'; silent?: boolean } = {}) => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      const isSilent = options.silent === true;
      if (!isSilent) {
        setLoading(true);
        setError(null);
      }

      try {
        await run('mcp_manager', { action: options.action ?? 'refresh' });
      } catch (cause) {
        if (!isSilent) {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
        }
      } finally {
        if (!isSilent) {
          setLoading(false);
        }
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null;
      }
    }
  }, [run]);

  const refresh = useCallback(() => {
    return runRefresh();
  }, [runRefresh]);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    void runRefresh({ action: 'bootstrap' });
  }, [runRefresh]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void runRefresh({ silent: true });
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void runRefresh({ silent: true });
    }, MCP_AUTO_REFRESH_INTERVAL_MS);

    window.addEventListener('focus', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    window.addEventListener('pageshow', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
      window.removeEventListener('pageshow', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [runRefresh]);

  return { loading, error, refresh };
}
