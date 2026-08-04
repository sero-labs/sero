/**
 * Hook for managing local model provider configuration.
 *
 * Reads/writes models.json through IPC and provides helpers
 * for adding, editing, and removing providers and models.
 */

import { useState, useCallback } from 'react';
import type {
  LocalModelsConfig,
  LocalModelsSaveResult,
  LocalModelsConnectionRequest,
  LocalProviderConfig,
  LocalModelEntry,
  LocalRemoteModelInfo,
} from '@/types/local-models';

/** Load config from main process. */
async function loadConfig(): Promise<LocalModelsConfig> {
  return window.sero.localModels.getConfig();
}

/** Save config to main process (writes models.json + refreshes ModelRegistry). */
async function saveConfig(config: LocalModelsConfig): Promise<LocalModelsSaveResult> {
  return window.sero.localModels.saveConfig(config);
}

export interface UseLocalModelsOptions {
  onSaved?: () => Promise<void> | void;
}

export interface UseLocalModelsReturn {
  config: LocalModelsConfig | null;
  loading: boolean;
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
  addProvider: (name: string, provider: LocalProviderConfig) => Promise<void>;
  updateProvider: (name: string, provider: LocalProviderConfig) => Promise<void>;
  removeProvider: (name: string) => Promise<void>;
  renameProvider: (oldName: string, newName: string) => Promise<void>;
  addModel: (providerName: string, model: LocalModelEntry) => Promise<void>;
  updateModel: (providerName: string, modelId: string, model: LocalModelEntry) => Promise<void>;
  removeModel: (providerName: string, modelId: string) => Promise<void>;
  testConnection: (request: LocalModelsConnectionRequest) => Promise<{ ok: boolean; error?: string }>;
  fetchRemoteModels: (request: LocalModelsConnectionRequest) => Promise<LocalRemoteModelInfo[]>;
}

export function useLocalModels(options: UseLocalModelsOptions = {}): UseLocalModelsReturn {
  const { onSaved } = options;
  const [config, setConfig] = useState<LocalModelsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const getEditableConfig = useCallback((): LocalModelsConfig => {
    if (error) {
      throw new Error('Fix the existing models.json error before editing local providers.');
    }
    return config ?? { providers: {} };
  }, [config, error]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const cfg = await loadConfig();
      setConfig(cfg);
    } catch (err) {
      setConfig(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback(async (cfg: LocalModelsConfig) => {
    const result = await saveConfig(cfg);
    setConfig(cfg);
    setError(null);
    setWarning(result.warning ?? null);
    try {
      await onSaved?.();
    } catch (err) {
      console.error('[local-models] post-save refresh failed:', err);
    }
  }, [onSaved]);

  const addProvider = useCallback(async (name: string, provider: LocalProviderConfig) => {
    const cfg = getEditableConfig();
    if (cfg.providers[name]) throw new Error(`Provider "${name}" already exists`);
    await persist({ providers: { ...cfg.providers, [name]: provider } });
  }, [getEditableConfig, persist]);

  const updateProvider = useCallback(async (name: string, provider: LocalProviderConfig) => {
    const cfg = getEditableConfig();
    await persist({ providers: { ...cfg.providers, [name]: provider } });
  }, [getEditableConfig, persist]);

  const removeProvider = useCallback(async (name: string) => {
    const cfg = getEditableConfig();
    const { [name]: _, ...rest } = cfg.providers;
    await persist({ providers: rest });
  }, [getEditableConfig, persist]);

  const renameProvider = useCallback(async (oldName: string, newName: string) => {
    const cfg = getEditableConfig();
    if (cfg.providers[newName]) throw new Error(`Provider "${newName}" already exists`);
    const provider = cfg.providers[oldName];
    if (!provider) throw new Error(`Provider "${oldName}" not found`);
    const { [oldName]: _, ...rest } = cfg.providers;
    await persist({ providers: { ...rest, [newName]: provider } });
  }, [getEditableConfig, persist]);

  const addModel = useCallback(async (providerName: string, model: LocalModelEntry) => {
    const cfg = getEditableConfig();
    const provider = cfg.providers[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    const models = provider.models ?? [];
    if (models.some((m) => m.id === model.id)) {
      throw new Error(`Model "${model.id}" already exists in "${providerName}"`);
    }
    await persist({
      providers: {
        ...cfg.providers,
        [providerName]: { ...provider, models: [...models, model] },
      },
    });
  }, [getEditableConfig, persist]);

  const updateModel = useCallback(async (providerName: string, modelId: string, model: LocalModelEntry) => {
    const cfg = getEditableConfig();
    const provider = cfg.providers[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    const models = provider.models ?? [];
    await persist({
      providers: {
        ...cfg.providers,
        [providerName]: {
          ...provider,
          models: models.map((m) => m.id === modelId ? model : m),
        },
      },
    });
  }, [getEditableConfig, persist]);

  const removeModel = useCallback(async (providerName: string, modelId: string) => {
    const cfg = getEditableConfig();
    const provider = cfg.providers[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    const models = provider.models ?? [];
    await persist({
      providers: {
        ...cfg.providers,
        [providerName]: {
          ...provider,
          models: models.filter((m) => m.id !== modelId),
        },
      },
    });
  }, [getEditableConfig, persist]);

  const testConnection = useCallback(async (request: LocalModelsConnectionRequest) => {
    return window.sero.localModels.testConnection(request);
  }, []);

  const fetchRemoteModels = useCallback(async (request: LocalModelsConnectionRequest) => {
    return window.sero.localModels.fetchRemoteModels(request);
  }, []);

  return {
    config,
    loading,
    error,
    warning,
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
