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
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Reload keeps the rendered list in place. Only the first load shows a
   * placeholder — swapping the list out on every action unmounts the cards and
   * closes any details panel the user has open.
   */
  const reload = useCallback(async () => {
    try {
      setPlugins(await getSero().agentPlugins.list());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load Agent Plugins.');
    } finally {
      setLoaded(true);
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
    loading: !loaded,
    busy,
    error,
    clearInspection: () => setInspection(null),
    clearUpdatePreview: () => setUpdatePreview(null),
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
    update: async (id: string, contentDigest: string, approveMcpChanges: boolean) => {
      const result = await run(() => getSero().agentPlugins.update({ id, contentDigest, approveMcpChanges }));
      if (result) setUpdatePreview(null);
      return result;
    },
    remove: (request: AgentPluginRemoveRequest) => run(() => getSero().agentPlugins.remove(request)),
    // Revealing a folder changes nothing in the profile, so it neither reloads
    // the list nor blocks the surface while the file manager opens.
    reveal: async (id: string, target: 'package' | 'data') => {
      setError(null);
      try {
        await getSero().agentPlugins.reveal(id, target);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to open the folder.');
      }
    },
  };
}

export type AgentPluginsController = ReturnType<typeof useAgentPlugins>;
