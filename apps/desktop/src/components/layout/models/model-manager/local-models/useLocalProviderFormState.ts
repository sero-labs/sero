import { useCallback, useMemo, useState } from 'react';
import type {
  LocalProviderConfig,
  LocalModelApi,
  LocalModelEntry,
  LocalModelsConnectionRequest,
  LocalProviderPreset,
  LocalRemoteModelInfo,
} from '@/types/local-models';
import { PROVIDER_PRESETS } from './presets';
import {
  buildCompat,
  getPresetName,
  hasAdvancedSettings,
  normalizeProviderName,
  shouldReplacePresetName,
} from './shared';

interface ExistingLocalProvider {
  name: string;
  config: LocalProviderConfig;
}

export interface UseLocalProviderFormStateOptions {
  existing?: ExistingLocalProvider | null;
  existingNames: string[];
  onSave: (name: string, config: LocalProviderConfig) => Promise<void>;
  onTestConnection: (request: LocalModelsConnectionRequest) => Promise<{ ok: boolean; error?: string }>;
  onFetchModels: (request: LocalModelsConnectionRequest) => Promise<LocalRemoteModelInfo[]>;
}

export function useLocalProviderFormState({
  existing,
  existingNames,
  onSave,
  onTestConnection,
  onFetchModels,
}: UseLocalProviderFormStateOptions) {
  const isEditing = !!existing;
  const existingConfig = existing?.config;
  const showsAdvancedNotice = hasAdvancedSettings(existingConfig);

  const [name, setName] = useState(existing?.name ?? '');
  const [baseUrl, setBaseUrlState] = useState(existingConfig?.baseUrl ?? '');
  const [api, setApi] = useState<LocalModelApi>(existingConfig?.api ?? 'openai-completions');
  const [apiKey, setApiKey] = useState(existingConfig?.apiKey ?? '');
  const [supportsDeveloperRole, setSupportsDeveloperRole] = useState(
    existingConfig?.compat?.supportsDeveloperRole ?? true,
  );
  const [supportsReasoningEffort, setSupportsReasoningEffort] = useState(
    existingConfig?.compat?.supportsReasoningEffort ?? true,
  );
  const [models, setModels] = useState<LocalModelEntry[]>(existingConfig?.models ?? []);
  const [newModelId, setNewModelId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetConnectionState = useCallback(() => {
    setConnectionStatus('idle');
    setConnectionError(null);
  }, []);

  const buildConnectionRequest = useCallback(
    (): LocalModelsConnectionRequest => ({
      baseUrl: baseUrl.trim(),
      api,
      apiKey: apiKey.trim() || undefined,
      headers: existingConfig?.headers,
      authHeader: existingConfig?.authHeader,
    }),
    [api, apiKey, baseUrl, existingConfig],
  );

  const handleNameChange = useCallback((value: string) => {
    setName(value);
  }, []);

  const handleBaseUrlChange = useCallback(
    (value: string) => {
      setBaseUrlState(value);
      resetConnectionState();
    },
    [resetConnectionState],
  );

  const handleApiChange = useCallback((value: LocalModelApi) => {
    setApi(value);
  }, []);

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value);
  }, []);

  const handleSupportsDeveloperRoleChange = useCallback((checked: boolean) => {
    setSupportsDeveloperRole(checked);
  }, []);

  const handleSupportsReasoningEffortChange = useCallback((checked: boolean) => {
    setSupportsReasoningEffort(checked);
  }, []);

  const handleNewModelIdChange = useCallback((value: string) => {
    setNewModelId(value);
  }, []);

  const applyPreset = useCallback(
    (preset: LocalProviderPreset) => {
      const presetConfig = PROVIDER_PRESETS[preset];
      if (shouldReplacePresetName(name)) {
        setName(getPresetName(preset));
      }
      setBaseUrlState(presetConfig.baseUrl);
      setApi(presetConfig.api);
      setApiKey(presetConfig.apiKey);
      setSupportsDeveloperRole(presetConfig.compat?.supportsDeveloperRole ?? true);
      setSupportsReasoningEffort(presetConfig.compat?.supportsReasoningEffort ?? true);
      resetConnectionState();
    },
    [name, resetConnectionState],
  );

  const handleTestConnection = useCallback(async () => {
    if (!baseUrl.trim()) return;
    setConnectionStatus('testing');
    setConnectionError(null);
    try {
      const result = await onTestConnection(buildConnectionRequest());
      setConnectionStatus(result.ok ? 'ok' : 'error');
      setConnectionError(result.error ?? null);
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : String(error));
    }
  }, [baseUrl, buildConnectionRequest, onTestConnection]);

  const handleFetchModels = useCallback(async () => {
    if (!baseUrl.trim()) return;
    setFetchingModels(true);
    setConnectionError(null);
    try {
      const remoteModels = await onFetchModels(buildConnectionRequest());
      if (remoteModels.length > 0) {
        setModels((previous) => {
          const existingIds = new Set(previous.map((model) => model.id));
          const nextModels = remoteModels
            .filter((model) => !existingIds.has(model.id))
            .map((model) => ({ id: model.id, name: model.name }));
          return nextModels.length > 0 ? [...previous, ...nextModels] : previous;
        });
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setFetchingModels(false);
    }
  }, [baseUrl, buildConnectionRequest, onFetchModels]);

  const handleAddModel = useCallback(() => {
    const id = newModelId.trim();
    if (!id || models.some((model) => model.id === id)) return;
    setModels((previous) => [...previous, { id }]);
    setNewModelId('');
  }, [models, newModelId]);

  const handleRemoveModel = useCallback((id: string) => {
    setModels((previous) => previous.filter((model) => model.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = normalizeProviderName(name);
    if (!trimmedName) return;
    if (!isEditing && existingNames.includes(trimmedName)) {
      setSaveError(`Provider "${trimmedName}" already exists`);
      return;
    }

    const compat = buildCompat(
      existingConfig?.compat,
      supportsDeveloperRole,
      supportsReasoningEffort,
    );

    const config: LocalProviderConfig = {
      ...existingConfig,
      baseUrl: baseUrl.trim() || undefined,
      api,
      apiKey: apiKey.trim() || undefined,
      compat,
      models,
    };

    setSaving(true);
    setSaveError(null);
    try {
      await onSave(trimmedName, config);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  }, [
    api,
    apiKey,
    baseUrl,
    existingConfig,
    existingNames,
    isEditing,
    models,
    name,
    onSave,
    supportsDeveloperRole,
    supportsReasoningEffort,
  ]);

  const isValid = useMemo(() => Boolean(name.trim() && baseUrl.trim()), [baseUrl, name]);

  return {
    api,
    apiKey,
    applyPreset,
    baseUrl,
    connectionError,
    connectionStatus,
    fetchingModels,
    handleAddModel,
    handleApiChange,
    handleApiKeyChange,
    handleBaseUrlChange,
    handleFetchModels,
    handleNameChange,
    handleNewModelIdChange,
    handleRemoveModel,
    handleSave,
    handleSupportsDeveloperRoleChange,
    handleSupportsReasoningEffortChange,
    handleTestConnection,
    isEditing,
    isValid,
    models,
    name,
    newModelId,
    saveError,
    saving,
    showsAdvancedNotice,
    supportsDeveloperRole,
    supportsReasoningEffort,
  };
}
