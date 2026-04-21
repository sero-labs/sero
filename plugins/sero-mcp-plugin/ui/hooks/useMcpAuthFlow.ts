import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

export interface McpAuthSession {
  serverName: string;
  authUrl: string;
}

export interface McpAuthFlowState {
  loading: boolean;
  error: string | null;
  session: McpAuthSession | null;
  setError: (message: string | null) => void;
  startAuth: (serverName: string) => Promise<boolean>;
  completeAuth: (serverName: string, callbackUrl: string) => Promise<boolean>;
  cancelAuth: (serverName: string) => Promise<boolean>;
}

export function useMcpAuthFlow(): McpAuthFlowState {
  const { run } = useAppTools();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<McpAuthSession | null>(null);

  const startAuth = useCallback(async (serverName: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await run('mcp_manager', { action: 'start_auth', serverName });
      const authUrl = typeof result.details?.authUrl === 'string' ? result.details.authUrl : null;
      setSession(authUrl ? { serverName, authUrl } : null);
      if (result.isError) {
        setError(result.text);
        return false;
      }
      return true;
    } catch (cause) {
      setSession(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setLoading(false);
    }
  }, [run]);

  const completeAuth = useCallback(async (serverName: string, callbackUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await run('mcp_manager', { action: 'complete_auth', serverName, callbackUrl });
      if (result.isError) {
        setError(result.text);
        return false;
      }
      setSession((current) => current?.serverName === serverName ? null : current);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setLoading(false);
    }
  }, [run]);

  const cancelAuth = useCallback(async (serverName: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await run('mcp_manager', { action: 'cancel_auth', serverName });
      if (result.isError) {
        setError(result.text);
        return false;
      }
      setSession((current) => current?.serverName === serverName ? null : current);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setLoading(false);
    }
  }, [run]);

  return {
    loading,
    error,
    session,
    setError,
    startAuth,
    completeAuth,
    cancelAuth,
  };
}
