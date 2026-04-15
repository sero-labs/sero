/**
 * Form for adding or editing a local LLM provider.
 * Shows preset buttons for quick setup, connection test, and model fetching.
 */

import { ArrowLeft } from 'lucide-react';
import type {
  LocalProviderConfig,
  LocalModelsConnectionRequest,
  LocalRemoteModelInfo,
} from '@/types/local-models';
import { LocalProviderCompatSection } from './LocalProviderCompatSection';
import { LocalProviderConnectionSection } from './LocalProviderConnectionSection';
import { LocalProviderFooter } from './LocalProviderFooter';
import { LocalProviderModelsSection } from './LocalProviderModelsSection';
import { LocalProviderPresetSection } from './LocalProviderPresetSection';
import { useLocalProviderFormState } from './useLocalProviderFormState';

interface LocalProviderFormProps {
  /** Existing provider to edit, or null for new. */
  existing?: { name: string; config: LocalProviderConfig } | null;
  /** Provider names already in use (for validation). */
  existingNames: string[];
  onSave: (name: string, config: LocalProviderConfig) => Promise<void>;
  onCancel: () => void;
  onTestConnection: (request: LocalModelsConnectionRequest) => Promise<{ ok: boolean; error?: string }>;
  onFetchModels: (request: LocalModelsConnectionRequest) => Promise<LocalRemoteModelInfo[]>;
}

export function LocalProviderForm({
  existing,
  existingNames,
  onSave,
  onCancel,
  onTestConnection,
  onFetchModels,
}: LocalProviderFormProps) {
  const state = useLocalProviderFormState({
    existing,
    existingNames,
    onSave,
    onTestConnection,
    onFetchModels,
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {state.isEditing ? 'Edit Provider' : 'Add Local Provider'}
        </h3>
      </div>

      {state.showsAdvancedNotice && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          Advanced models.json fields are preserved on save, but they still need to be edited directly in the file.
        </div>
      )}

      {!state.isEditing && (
        <LocalProviderPresetSection onSelect={state.applyPreset} />
      )}

      <LocalProviderConnectionSection
        name={state.name}
        isEditing={state.isEditing}
        onNameChange={state.handleNameChange}
        baseUrl={state.baseUrl}
        onBaseUrlChange={state.handleBaseUrlChange}
        api={state.api}
        onApiChange={state.handleApiChange}
        apiKey={state.apiKey}
        onApiKeyChange={state.handleApiKeyChange}
        connectionStatus={state.connectionStatus}
        connectionError={state.connectionError}
        onTestConnection={state.handleTestConnection}
      />

      <LocalProviderCompatSection
        supportsDeveloperRole={state.supportsDeveloperRole}
        onSupportsDeveloperRoleChange={state.handleSupportsDeveloperRoleChange}
        supportsReasoningEffort={state.supportsReasoningEffort}
        onSupportsReasoningEffortChange={state.handleSupportsReasoningEffortChange}
      />

      <LocalProviderModelsSection
        baseUrl={state.baseUrl}
        fetchingModels={state.fetchingModels}
        models={state.models}
        newModelId={state.newModelId}
        onFetchModels={state.handleFetchModels}
        onNewModelIdChange={state.handleNewModelIdChange}
        onAddModel={state.handleAddModel}
        onRemoveModel={state.handleRemoveModel}
      />

      <LocalProviderFooter
        saveError={state.saveError}
        isEditing={state.isEditing}
        isValid={state.isValid}
        saving={state.saving}
        onCancel={onCancel}
        onSave={state.handleSave}
      />
    </div>
  );
}
