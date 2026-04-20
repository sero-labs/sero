import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import type { McpServerEditorInput } from '../../shared/types';

interface McpServerMutations {
  pendingAction: string | null;
  error: string | null;
  clearError: () => void;
  upsertServer: (input: McpServerEditorInput) => Promise<boolean>;
  removeServer: (serverName: string) => Promise<boolean>;
  toggleServer: (serverName: string, enabled: boolean) => Promise<boolean>;
  connectServer: (serverName: string, reconnect?: boolean) => Promise<boolean>;
}

export function useMcpServerMutations(): McpServerMutations {
  const { run } = useAppTools();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (label: string, params: Record<string, unknown>) => {
    setPendingAction(label);
    setError(null);
    try {
      const result = await run('mcp_manager', params);
      if (result.isError) {
        setError(result.text);
        return false;
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [run]);

  const upsertServer = useCallback((input: McpServerEditorInput) => {
    return execute('save', { action: 'upsert_server', ...input });
  }, [execute]);

  const removeServer = useCallback((serverName: string) => {
    return execute(`remove:${serverName}`, { action: 'remove_server', serverName });
  }, [execute]);

  const toggleServer = useCallback((serverName: string, enabled: boolean) => {
    return execute(`${enabled ? 'enable' : 'disable'}:${serverName}`, {
      action: enabled ? 'enable_server' : 'disable_server',
      serverName,
    });
  }, [execute]);

  const connectServer = useCallback((serverName: string, reconnect = false) => {
    return execute(`${reconnect ? 'reconnect' : 'connect'}:${serverName}`, {
      action: reconnect ? 'reconnect_server' : 'connect_server',
      serverName,
    });
  }, [execute]);

  return {
    pendingAction,
    error,
    clearError: () => setError(null),
    upsertServer,
    removeServer,
    toggleServer,
    connectServer,
  };
}
