/**
 * Hook for managing local model provider configuration.
 *
 * Reads/writes models.json through IPC and provides helpers
 * for adding, editing, and removing providers and models.
 */

import { useState, useCallback } from 'react';
import type {
  LocalModelsConfig,
  LocalProviderConfig,
  LocalModelEntry,
} from '@/types/local-models';

/** Load config from main process. */
async function loadConfig(): Promise<LocalModelsConfig> {
  return window.sero.localModels.getConfig();
}

/** Save config to main process (writes models.json + refreshes ModelRegistry). */
async function saveConfig(config: LocalModelsConfig): Promise<void> {
  return window.sero.localModels.saveConfig(config);
}

export interface UseLocalModelsReturn {
  config: LocalModelsConfig | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addProvider: (name: string, provider: LocalProviderConfig) => Promise<void>;
  updateProvider: (name: string, provider: LocalProviderConfig) => Promise<void>;
  removeProvider: (name: string) => Promise<void>;
  renameProvider: (oldName: string, newName: string) => Promise<void>;
  addModel: (providerName: string, model: LocalModelEntry) => Promise<void>;
  updateModel: (providerName: string, modelId: string, model: LocalModelEntry) => Promise<void>;
  removeModel: (providerName: string, modelId: string) => Promise<void>;
  testConnection: (baseUrl: string) => Promise<{ ok: boolean; error?: string }>;
  fetchRemoteModels: (baseUrl: string) => Promise<{ id: string; name?: string }[]>;
}

export function useLocalModels(): UseLocalModelsReturn {
  const [config, setConfig] = useState<LocalModelsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await loadConfig();
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback(async (cfg: LocalModelsConfig) => {
    await saveConfig(cfg);
    setConfig(cfg);
  }, []);

  const addProvider = useCallback(async (name: string, provider: LocalProviderConfig) => {
    const cfg = config ?? { providers: {} };
    if (cfg.providers[name]) throw new Error(`Provider "${name}" already exists`);
    await persist({ providers: { ...cfg.providers, [name]: provider } });
  }, [config, persist]);

  const updateProvider = useCallback(async (name: string, provider: LocalProviderConfig) => {
    const cfg = config ?? { providers: {} };
    await persist({ providers: { ...cfg.providers, [name]: provider } });
  }, [config, persist]);

  const removeProvider = useCallback(async (name: string) => {
    const cfg = config ?? { providers: {} };
    const { [name]: _, ...rest } = cfg.providers;
    await persist({ providers: rest });
  }, [config, persist]);

  const renameProvider = useCallback(async (oldName: string, newName: string) => {
    const cfg = config ?? { providers: {} };
    if (cfg.providers[newName]) throw new Error(`Provider "${newName}" already exists`);
    const provider = cfg.providers[oldName];
    if (!provider) throw new Error(`Provider "${oldName}" not found`);
    const { [oldName]: _, ...rest } = cfg.providers;
    await persist({ providers: { ...rest, [newName]: provider } });
  }, [config, persist]);

  const addModel = useCallback(async (providerName: string, model: LocalModelEntry) => {
    const cfg = config ?? { providers: {} };
    const provider = cfg.providers[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    if (provider.models.some((m) => m.id === model.id)) {
      throw new Error(`Model "${model.id}" already exists in "${providerName}"`);
    }
    await persist({
      providers: {
        ...cfg.providers,
        [providerName]: { ...provider, models: [...provider.models, model] },
      },
    });
  }, [config, persist]);

  const updateModel = useCallback(async (providerName: string, modelId: string, model: LocalModelEntry) => {
    const cfg = config ?? { providers: {} };
    const provider = cfg.providers[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    await persist({
      providers: {
        ...cfg.providers,
        [providerName]: {
          ...provider,
          models: provider.models.map((m) => m.id === modelId ? model : m),
        },
      },
    });
  }, [config, persist]);

  const removeModel = useCallback(async (providerName: string, modelId: string) => {
    const cfg = config ?? { providers: {} };
    const provider = cfg.providers[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    await persist({
      providers: {
        ...cfg.providers,
        [providerName]: {
          ...provider,
          models: provider.models.filter((m) => m.id !== modelId),
        },
      },
    });
  }, [config, persist]);

  const testConnection = useCallback(async (baseUrl: string) => {
    return window.sero.localModels.testConnection(baseUrl);
  }, []);

  const fetchRemoteModels = useCallback(async (baseUrl: string) => {
    return window.sero.localModels.fetchRemoteModels(baseUrl);
  }, []);

  return {
    config,
    loading,
    error,
    reload,
    addProvider,
    updateProvider,
    removeProvider,
    renameProvider,
    addModel,
    updateModel,
    removeModel,
    testConnection,
    fetchRemoteModels,
  };
}
