import { useCallback, useEffect, useState } from 'react';
import type { InstalledPlugin } from '@sero/common';
import { getSero } from './host';
import { normalizeInstallSource, sortInstalledPlugins } from '../lib/plugins';

export function usePlugins() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [uninstallingIds, setUninstallingIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const installed = await getSero().plugins.list();
      setPlugins(sortInstalledPlugins(installed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + IPC subscription for live updates.
  // useEffect is acceptable here: subscribing to an external IPC source
  // that requires setup/teardown — no Zustand equivalent in a federated remote.
  useEffect(() => {
    void reload();

    return getSero().plugins.onChanged(() => {
      void reload();
    });
  }, [reload]);

  const install = useCallback(async (source: string) => {
    const trimmed = normalizeInstallSource(source);
    if (!trimmed) {
      setError('Enter an npm:, git:, or absolute local path source.');
      return false;
    }

    setInstalling(true);
    setError(null);
    try {
      await getSero().plugins.install(trimmed);
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install plugin');
      return false;
    } finally {
      setInstalling(false);
    }
  }, [reload]);

  const uninstall = useCallback(async (pluginId: string) => {
    setError(null);
    setUninstallingIds((prev) => [...prev, pluginId]);
    try {
      await getSero().plugins.uninstall(pluginId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall plugin');
    } finally {
      setUninstallingIds((prev) => prev.filter((id) => id !== pluginId));
    }
  }, [reload]);

  const revealInFinder = useCallback(async (pluginPath: string) => {
    setError(null);
    try {
      await getSero().shell.showItemInFolder(pluginPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal plugin in Finder');
    }
  }, []);

  return {
    plugins,
    loading,
    error,
    installing,
    uninstallingIds,
    install,
    uninstall,
    reload,
    revealInFinder,
  };
}
