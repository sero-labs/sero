import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

interface BootstrapState {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMcpBootstrap(): BootstrapState {
  const { run } = useAppTools();
  const didBootstrapRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await run('mcp_manager', { action: 'bootstrap' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    void refresh();
  }, [refresh]);

  return { loading, error, refresh };
}
