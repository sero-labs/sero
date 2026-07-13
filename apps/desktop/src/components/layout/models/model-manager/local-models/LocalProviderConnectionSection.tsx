import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { LocalModelApi } from '@/types/local-models';
import { API_OPTIONS } from './shared';
import { LocalProviderField } from './LocalProviderField';

interface LocalProviderConnectionSectionProps {
  name: string;
  isEditing: boolean;
  onNameChange: (value: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  api: LocalModelApi;
  onApiChange: (value: LocalModelApi) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  connectionStatus: 'idle' | 'testing' | 'ok' | 'error';
  connectionError: string | null;
  onTestConnection: () => Promise<void>;
}

export function LocalProviderConnectionSection({
  name,
  isEditing,
  onNameChange,
  baseUrl,
  onBaseUrlChange,
  api,
  onApiChange,
  apiKey,
  onApiKeyChange,
  connectionStatus,
  connectionError,
  onTestConnection,
}: LocalProviderConnectionSectionProps) {
  return (
    <>
      <LocalProviderField label="Provider Name">
        <input aria-label="Provider name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. ollama, lm-studio"
          disabled={isEditing}
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
            outline-none focus:border-[var(--border-focus)] disabled:opacity-50"
        />
      </LocalProviderField>

      <LocalProviderField label="Base URL">
        <div className="flex gap-2">
          <input aria-label="Base URL"
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder="http://localhost:11434/v1"
            className="h-8 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
              px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
              outline-none focus:border-[var(--border-focus)]"
          />
          <button type="button"
            onClick={() => {
              void onTestConnection();
            }}
            disabled={!baseUrl.trim() || connectionStatus === 'testing'}
            className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-subtle)]
              px-2.5 text-sm font-medium text-[var(--text-secondary)]
              transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40"
          >
            {connectionStatus === 'testing' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : connectionStatus === 'ok' ? (
              <CheckCircle2 className="size-3 text-status-success" />
            ) : connectionStatus === 'error' ? (
              <XCircle className="size-3 text-status-error" />
            ) : null}
            Test
          </button>
        </div>
        {connectionError && (
          <p className="mt-1 text-sm text-status-error">{connectionError}</p>
        )}
      </LocalProviderField>

      <LocalProviderField label="API Type">
        <select aria-label="API type"
          value={api}
          onChange={(event) => onApiChange(event.target.value as LocalModelApi)}
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        >
          {API_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </LocalProviderField>

      <LocalProviderField label="API Key" hint="Literal value, env var name, or !command">
        <input aria-label="API key"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="ollama"
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
            outline-none focus:border-[var(--border-focus)]"
        />
      </LocalProviderField>
    </>
  );
}
