import { useCallback, useEffect, useState } from 'react';
import { getSero } from './useSeroFiles';

export interface InstalledPluginInfo {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  icon: string;
  category: string;
  tags: string[];
  source: string;
  packagePath: string;
  hasUI: boolean;
}

interface PluginChangeEvent {
  type: 'installed' | 'uninstalled';
}

function sortPlugins(plugins: InstalledPluginInfo[]): InstalledPluginInfo[] {
  return [...plugins].sort((a, b) => a.name.localeCompare(b.name));
}

export function usePlugins() {
  const [plugins, setPlugins] = useState<InstalledPluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [uninstallingIds, setUninstallingIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const installed = await getSero().plugins.list();
      setPlugins(sortPlugins(installed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();

    return getSero().plugins.onChanged((_event: PluginChangeEvent) => {
      void reload();
    });
  }, [reload]);

  const install = useCallback(async (source: string) => {
    const trimmed = source.trim();
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
