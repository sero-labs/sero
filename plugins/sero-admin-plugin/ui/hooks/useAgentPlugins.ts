import { useCallback, useEffect, useState } from 'react';
import type {
  AgentPluginCliSettingsRequest,
  AgentPluginInspection,
  AgentPluginInstallRequest,
  AgentPluginRemoveRequest,
  AgentPluginUpdatePreview,
  InstalledAgentPlugin,
} from '@sero-ai/common';
import { getSero } from './host';

export function useAgentPlugins() {
  const [plugins, setPlugins] = useState<InstalledAgentPlugin[]>([]);
  const [inspection, setInspection] = useState<AgentPluginInspection | null>(null);
  const [updatePreview, setUpdatePreview] = useState<AgentPluginUpdatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPlugins(await getSero().agentPlugins.list());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load Agent Plugins.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return getSero().agentPlugins.onChanged(() => void reload());
  }, [reload]);

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      await reload();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agent Plugin operation failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  return {
    plugins,
    inspection,
    updatePreview,
    loading,
    busy,
    error,
    clearInspection: () => setInspection(null),
    inspect: async (source: string) => {
      const result = await run(() => getSero().agentPlugins.inspectSource(source));
      if (result) setInspection(result);
      return result;
    },
    install: (request: AgentPluginInstallRequest) => run(() => getSero().agentPlugins.install(request)),
    setEnabled: (id: string, enabled: boolean) => run(() => getSero().agentPlugins.setEnabled(id, enabled)),
    approve: (id: string) => run(() => getSero().agentPlugins.approveComponents(id)),
    setCliExposure: (request: AgentPluginCliSettingsRequest) => run(() => getSero().agentPlugins.setCliExposure(request)),
    previewUpdate: async (id: string) => {
      const result = await run(() => getSero().agentPlugins.previewUpdate(id));
      if (result) setUpdatePreview(result);
      return result;
    },
    update: (id: string, approveExecutableChanges: boolean) => run(() => getSero().agentPlugins.update({ id, approveExecutableChanges })),
    remove: (request: AgentPluginRemoveRequest) => run(() => getSero().agentPlugins.remove(request)),
    reveal: (id: string, target: 'package' | 'data') => run(() => getSero().agentPlugins.reveal(id, target)),
  };
}

export type AgentPluginsController = ReturnType<typeof useAgentPlugins>;
