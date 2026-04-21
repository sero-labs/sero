import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

export interface McpRawConfigState {
  loading: boolean;
  saving: boolean;
  error: string | null;
  isOpen: boolean;
  rawConfig: string;
  open: () => Promise<void>;
  close: () => void;
  setRawConfig: (value: string) => void;
  save: () => Promise<boolean>;
}

export function useMcpRawConfig(): McpRawConfigState {
  const { run } = useAppTools();
  const [isOpen, setIsOpen] = useState(false);
  const [rawConfig, setRawConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setIsOpen(true);
    setLoading(true);
    setError(null);
    try {
      const result = await run('mcp_manager', { action: 'get_raw_config' });
      const raw = typeof result.details?.rawConfig === 'string' ? result.details.rawConfig : result.text;
      setRawConfig(raw);
      if (result.isError) {
        setError(result.text);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [run]);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await run('mcp_manager', { action: 'save_raw_config', rawConfig });
      if (result.isError) {
        setError(result.text);
        return false;
      }
      const savedRaw = typeof result.details?.rawConfig === 'string' ? result.details.rawConfig : rawConfig;
      setRawConfig(savedRaw);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }, [rawConfig, run]);

  return {
    loading,
    saving,
    error,
    isOpen,
    rawConfig,
    open,
    close,
    setRawConfig,
    save,
  };
}
