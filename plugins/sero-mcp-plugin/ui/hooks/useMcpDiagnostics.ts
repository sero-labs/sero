import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

export interface McpDiagnosticsState {
  loading: boolean;
  error: string | null;
  isOpen: boolean;
  diagnostics: string;
  open: () => Promise<void>;
  close: () => void;
  refresh: () => Promise<void>;
}

export function useMcpDiagnostics(): McpDiagnosticsState {
  const { run } = useAppTools();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await run('mcp_manager', { action: 'get_diagnostics' });
      setDiagnostics(result.text);
      if (result.isError) {
        setError(result.text);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [run]);

  const open = useCallback(async () => {
    setIsOpen(true);
    await load();
  }, [load]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    loading,
    error,
    isOpen,
    diagnostics,
    open,
    close,
    refresh: load,
  };
}
