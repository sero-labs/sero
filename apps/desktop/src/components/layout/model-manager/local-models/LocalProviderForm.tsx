/**
 * Form for adding or editing a local LLM provider.
 * Shows preset buttons for quick setup, connection test, and model fetching.
 */

import { useState, useCallback } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Plus, Download } from 'lucide-react';
import type {
  LocalProviderConfig,
  LocalModelApi,
  LocalModelEntry,
  LocalProviderPreset,
} from '@/types/local-models';
import { PROVIDER_PRESETS, PRESET_ORDER } from './presets';

const API_OPTIONS: { value: LocalModelApi; label: string }[] = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
];

interface LocalProviderFormProps {
  /** Existing provider to edit, or null for new. */
  existing?: { name: string; config: LocalProviderConfig } | null;
  /** Provider names already in use (for validation). */
  existingNames: string[];
  onSave: (name: string, config: LocalProviderConfig) => Promise<void>;
  onCancel: () => void;
  onTestConnection: (baseUrl: string) => Promise<{ ok: boolean; error?: string }>;
  onFetchModels: (baseUrl: string) => Promise<{ id: string; name?: string }[]>;
}

export function LocalProviderForm({
  existing,
  existingNames,
  onSave,
  onCancel,
  onTestConnection,
  onFetchModels,
}: LocalProviderFormProps) {
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.config.baseUrl ?? '');
  const [api, setApi] = useState<LocalModelApi>(existing?.config.api ?? 'openai-completions');
  const [apiKey, setApiKey] = useState(existing?.config.apiKey ?? '');
  const [supportsDeveloperRole, setSupportsDeveloperRole] = useState(
    existing?.config.compat?.supportsDeveloperRole ?? true,
  );
  const [supportsReasoningEffort, setSupportsReasoningEffort] = useState(
    existing?.config.compat?.supportsReasoningEffort ?? true,
  );
  const [models, setModels] = useState<LocalModelEntry[]>(existing?.config.models ?? []);
  const [newModelId, setNewModelId] = useState('');

  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const applyPreset = useCallback((preset: LocalProviderPreset) => {
    const cfg = PROVIDER_PRESETS[preset];
    if (!name || name === PROVIDER_PRESETS.ollama.label.toLowerCase() ||
        name === PROVIDER_PRESETS['lm-studio'].label.toLowerCase() ||
        name === PROVIDER_PRESETS.vllm.label.toLowerCase()) {
      setName(cfg.label.toLowerCase().replace(/\s+/g, '-'));
    }
    setBaseUrl(cfg.baseUrl);
    setApi(cfg.api);
    setApiKey(cfg.apiKey);
    setSupportsDeveloperRole(cfg.compat?.supportsDeveloperRole ?? true);
    setSupportsReasoningEffort(cfg.compat?.supportsReasoningEffort ?? true);
    setConnectionStatus('idle');
  }, [name]);

  const handleTestConnection = useCallback(async () => {
    if (!baseUrl) return;
    setConnectionStatus('testing');
    setConnectionError(null);
    const result = await onTestConnection(baseUrl);
    setConnectionStatus(result.ok ? 'ok' : 'error');
    setConnectionError(result.error ?? null);
  }, [baseUrl, onTestConnection]);

  const handleFetchModels = useCallback(async () => {
    if (!baseUrl) return;
    setFetchingModels(true);
    const remote = await onFetchModels(baseUrl);
    if (remote.length > 0) {
      const existingIds = new Set(models.map((m) => m.id));
      const newModels = remote.filter((m) => !existingIds.has(m.id));
      if (newModels.length > 0) {
        setModels((prev) => [
          ...prev,
          ...newModels.map((m) => ({ id: m.id, name: m.name })),
        ]);
      }
    }
    setFetchingModels(false);
  }, [baseUrl, models, onFetchModels]);

  const handleAddModel = useCallback(() => {
    const id = newModelId.trim();
    if (!id || models.some((m) => m.id === id)) return;
    setModels((prev) => [...prev, { id }]);
    setNewModelId('');
  }, [newModelId, models]);

  const handleRemoveModel = useCallback((id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmedName) return;
    if (!isEditing && existingNames.includes(trimmedName)) {
      setSaveError(`Provider "${trimmedName}" already exists`);
      return;
    }

    const compat: LocalProviderConfig['compat'] =
      !supportsDeveloperRole || !supportsReasoningEffort
        ? {
            ...(!supportsDeveloperRole ? { supportsDeveloperRole: false } : {}),
            ...(!supportsReasoningEffort ? { supportsReasoningEffort: false } : {}),
          }
        : undefined;

    const config: LocalProviderConfig = {
      baseUrl: baseUrl.trim(),
      api,
      apiKey: apiKey.trim() || 'none',
      ...(compat ? { compat } : {}),
      models,
    };

    setSaving(true);
    setSaveError(null);
    try {
      await onSave(trimmedName, config);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [name, baseUrl, api, apiKey, supportsDeveloperRole, supportsReasoningEffort, models, isEditing, existingNames, onSave]);

  const isValid = name.trim() && baseUrl.trim();

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {isEditing ? 'Edit Provider' : 'Add Local Provider'}
        </h3>
      </div>

      {/* Presets */}
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Quick Setup
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_ORDER.map((preset) => {
              const cfg = PROVIDER_PRESETS[preset];
              return (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className="rounded-lg border border-[var(--border-subtle)] px-2 py-2
                    text-center text-[11px] font-medium text-[var(--text-secondary)]
                    transition-colors hover:border-[var(--border-default)]
                    hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Provider Name */}
      <Field label="Provider Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. ollama, lm-studio"
          disabled={isEditing}
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
            outline-none focus:border-[var(--border-focus)] disabled:opacity-50"
        />
      </Field>

      {/* Base URL + Test button */}
      <Field label="Base URL">
        <div className="flex gap-2">
          <input
            value={baseUrl}
            onChange={(e) => { setBaseUrl(e.target.value); setConnectionStatus('idle'); }}
            placeholder="http://localhost:11434/v1"
            className="h-8 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
              px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
              outline-none focus:border-[var(--border-focus)]"
          />
          <button
            onClick={handleTestConnection}
            disabled={!baseUrl.trim() || connectionStatus === 'testing'}
            className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-subtle)]
              px-2.5 text-[11px] font-medium text-[var(--text-secondary)]
              transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40"
          >
            {connectionStatus === 'testing' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : connectionStatus === 'ok' ? (
              <CheckCircle2 className="size-3 text-[var(--status-success)]" />
            ) : connectionStatus === 'error' ? (
              <XCircle className="size-3 text-[var(--status-error)]" />
            ) : null}
            Test
          </button>
        </div>
        {connectionError && (
          <p className="mt-1 text-[10px] text-[var(--status-error)]">{connectionError}</p>
        )}
      </Field>

      {/* API Type */}
      <Field label="API Type">
        <select
          value={api}
          onChange={(e) => setApi(e.target.value as LocalModelApi)}
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        >
          {API_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>

      {/* API Key */}
      <Field label="API Key" hint="Required but often ignored by local servers">
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="ollama"
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
            outline-none focus:border-[var(--border-focus)]"
        />
      </Field>

      {/* Compatibility */}
      <Field label="Compatibility">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={supportsDeveloperRole}
              onChange={(e) => setSupportsDeveloperRole(e.target.checked)}
              className="rounded"
            />
            Supports developer role
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={supportsReasoningEffort}
              onChange={(e) => setSupportsReasoningEffort(e.target.checked)}
              className="rounded"
            />
            Supports reasoning effort
          </label>
        </div>
      </Field>

      {/* Models */}
      <Field label="Models">
        <div className="flex flex-col gap-2">
          {/* Fetch button */}
          <button
            onClick={handleFetchModels}
            disabled={!baseUrl.trim() || fetchingModels}
            className="flex h-7 items-center gap-1.5 self-start rounded-md border
              border-[var(--border-subtle)] px-2.5 text-[11px] font-medium
              text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]
              disabled:opacity-40"
          >
            {fetchingModels ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            Fetch from server
          </button>

          {/* Model list */}
          {models.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border border-[var(--border-subtle)] p-1.5">
              {models.map((m) => (
                <div
                  key={m.id}
                  className="group flex items-center justify-between rounded-md px-2 py-1
                    hover:bg-[var(--bg-elevated)]"
                >
                  <span className="text-xs text-[var(--text-primary)]">
                    {m.name ?? m.id}
                    {m.name && m.name !== m.id && (
                      <span className="ml-1.5 text-[var(--text-muted)]">{m.id}</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleRemoveModel(m.id)}
                    className="text-[10px] text-[var(--text-muted)] opacity-0
                      transition-opacity group-hover:opacity-100 hover:text-[var(--status-error)]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add model manually */}
          <div className="flex gap-1.5">
            <input
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
              placeholder="Model ID (e.g. llama3.1:8b)"
              className="h-7 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
                px-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                outline-none focus:border-[var(--border-focus)]"
            />
            <button
              onClick={handleAddModel}
              disabled={!newModelId.trim()}
              className="flex h-7 items-center gap-1 rounded-md border border-[var(--border-subtle)]
                px-2 text-[11px] font-medium text-[var(--text-secondary)]
                transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40"
            >
              <Plus className="size-3" />
              Add
            </button>
          </div>
        </div>
      </Field>

      {/* Save / Cancel */}
      {saveError && (
        <p className="text-[11px] text-[var(--status-error)]">{saveError}</p>
      )}
      <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          onClick={onCancel}
          className="h-8 rounded-md px-3 text-xs font-medium text-[var(--text-secondary)]
            transition-colors hover:bg-[var(--bg-elevated)]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--banner-primary)]
            px-3 text-xs font-medium text-white transition-colors
            hover:bg-[var(--banner-primary)]/80 disabled:opacity-40"
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Add Provider'}
        </button>
      </div>
    </div>
  );
}

/** Reusable field wrapper. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </label>
        {hint && (
          <span className="text-[10px] text-[var(--text-muted)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
