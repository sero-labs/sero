import { useCallback, useMemo, useState } from 'react';
import type {
  LocalProviderConfig,
  LocalModelApi,
  LocalModelEntry,
  LocalModelsConnectionRequest,
  LocalProviderPreset,
  LocalRemoteModelInfo,
  LocalProviderApiKeySource,
  LocalProviderAuthentication,
  LocalThinkingFormat,
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

function initialAuthentication(apiKey?: string): LocalProviderAuthentication {
  return !apiKey || apiKey === 'none' ? 'none' : 'api-key';
}

function initialApiKeySource(apiKey?: string): LocalProviderApiKeySource {
  if (apiKey?.startsWith('!')) return 'command';
  return apiKey && /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})$/.test(apiKey)
    ? 'environment'
    : 'literal';
}

function displayApiKey(apiKey?: string): string {
  if (!apiKey || apiKey === 'none') return '';
  if (apiKey.startsWith('!')) return apiKey.slice(1);
  const bracedEnvironment = apiKey.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (bracedEnvironment) return bracedEnvironment[1];
  const plainEnvironment = apiKey.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  return plainEnvironment?.[1] ?? apiKey;
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
  const [authentication, setAuthentication] = useState<LocalProviderAuthentication>(
    () => initialAuthentication(existingConfig?.apiKey),
  );
  const [apiKeySource, setApiKeySource] = useState<LocalProviderApiKeySource>(
    () => initialApiKeySource(existingConfig?.apiKey),
  );
  const [apiKey, setApiKey] = useState(() => displayApiKey(existingConfig?.apiKey));
  const [supportsDeveloperRole, setSupportsDeveloperRole] = useState(
    existingConfig?.compat?.supportsDeveloperRole ?? true,
  );
  const [supportsReasoningEffort, setSupportsReasoningEffort] = useState(
    existingConfig?.compat?.supportsReasoningEffort ?? true,
  );
  const [thinkingFormat, setThinkingFormat] = useState<LocalThinkingFormat>(
    existingConfig?.compat?.thinkingFormat ?? 'openai',
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

  const normalizedApiKey = useMemo(() => {
    if (authentication === 'none') return 'none';
    const value = apiKey.trim();
    if (apiKeySource === 'command' && value) return `!${value.replace(/^!/, '')}`;
    if (apiKeySource === 'environment' && value) {
      return value.startsWith('$') ? value : `$${value}`;
    }
    return value;
  }, [apiKey, apiKeySource, authentication]);

  const buildConnectionRequest = useCallback(
    (): LocalModelsConnectionRequest => ({
      baseUrl: baseUrl.trim(),
      api,
      apiKey: authentication === 'none' ? undefined : normalizedApiKey || undefined,
      headers: existingConfig?.headers,
      authHeader: existingConfig?.authHeader,
    }),
    [api, authentication, baseUrl, existingConfig, normalizedApiKey],
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

  const handleAuthenticationChange = useCallback((value: LocalProviderAuthentication) => {
    setAuthentication(value);
    resetConnectionState();
  }, [resetConnectionState]);

  const handleApiKeySourceChange = useCallback((value: LocalProviderApiKeySource) => {
    setApiKeySource(value);
    resetConnectionState();
  }, [resetConnectionState]);

  const handleSupportsDeveloperRoleChange = useCallback((checked: boolean) => {
    setSupportsDeveloperRole(checked);
  }, []);

  const handleSupportsReasoningEffortChange = useCallback((checked: boolean) => {
    setSupportsReasoningEffort(checked);
  }, []);

  const handleThinkingFormatChange = useCallback((value: LocalThinkingFormat) => {
    setThinkingFormat(value);
    if (value === 'qwen-chat-template') setSupportsReasoningEffort(true);
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
      setAuthentication(initialAuthentication(presetConfig.apiKey));
      setApiKeySource(initialApiKeySource(presetConfig.apiKey));
      setApiKey(displayApiKey(presetConfig.apiKey));
      setSupportsDeveloperRole(presetConfig.compat?.supportsDeveloperRole ?? true);
      setSupportsReasoningEffort(presetConfig.compat?.supportsReasoningEffort ?? true);
      setThinkingFormat(presetConfig.compat?.thinkingFormat ?? 'openai');
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

  const handleUpdateModel = useCallback((id: string, model: LocalModelEntry) => {
    setModels((previous) => previous.map((entry) => entry.id === id ? model : entry));
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
      thinkingFormat,
    );

    const config: LocalProviderConfig = {
      ...existingConfig,
      baseUrl: baseUrl.trim() || undefined,
      api,
      apiKey: normalizedApiKey,
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
    normalizedApiKey,
    baseUrl,
    existingConfig,
    existingNames,
    isEditing,
    models,
    name,
    onSave,
    supportsDeveloperRole,
    supportsReasoningEffort,
    thinkingFormat,
  ]);

  const isValid = useMemo(
    () => Boolean(
      name.trim()
      && baseUrl.trim()
      && (authentication === 'none' || normalizedApiKey),
    ),
    [authentication, baseUrl, name, normalizedApiKey],
  );

  return {
    api,
    apiKey,
    apiKeySource,
    applyPreset,
    authentication,
    baseUrl,
    connectionError,
    connectionStatus,
    fetchingModels,
    handleAddModel,
    handleApiChange,
    handleApiKeyChange,
    handleApiKeySourceChange,
    handleAuthenticationChange,
    handleBaseUrlChange,
    handleFetchModels,
    handleNameChange,
    handleNewModelIdChange,
    handleRemoveModel,
    handleUpdateModel,
    handleSave,
    handleSupportsDeveloperRoleChange,
    handleSupportsReasoningEffortChange,
    handleThinkingFormatChange,
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
    thinkingFormat,
  };
}
