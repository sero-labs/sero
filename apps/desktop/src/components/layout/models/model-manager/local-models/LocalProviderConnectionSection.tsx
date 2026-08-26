import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type {
  LocalModelApi,
  LocalProviderApiKeySource,
  LocalProviderAuthentication,
} from '@/types/local-models';
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
  apiKeySource: LocalProviderApiKeySource;
  onApiKeySourceChange: (value: LocalProviderApiKeySource) => void;
  authentication: LocalProviderAuthentication;
  onAuthenticationChange: (value: LocalProviderAuthentication) => void;
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
  apiKeySource,
  onApiKeySourceChange,
  authentication,
  onAuthenticationChange,
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

      <LocalProviderField label="Authentication">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-base)] p-1">
          {(['none', 'api-key'] as const).map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => onAuthenticationChange(option)}
              className={`h-7 rounded-md text-xs font-medium transition-colors ${
                authentication === option
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {option === 'none' ? 'None' : 'API key'}
            </button>
          ))}
        </div>
        {authentication === 'none' ? (
          <p className="text-sm text-[var(--text-muted)]">
            Use this for an endpoint that does not require credentials.
          </p>
        ) : (
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <select
              aria-label="API key source"
              value={apiKeySource}
              onChange={(event) => onApiKeySourceChange(
                event.target.value as LocalProviderApiKeySource,
              )}
              className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
                px-2 text-xs text-[var(--text-primary)] outline-none
                focus:border-[var(--border-focus)]"
            >
              <option value="literal">Literal value</option>
              <option value="environment">Environment variable</option>
              <option value="command">Command</option>
            </select>
            <input
              aria-label="API key"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={apiKeySource === 'environment'
                ? 'API_KEY'
                : apiKeySource === 'command'
                  ? 'security find-generic-password …'
                  : 'Enter API key'}
              className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
                px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                outline-none focus:border-[var(--border-focus)]"
            />
          </div>
        )}
      </LocalProviderField>
    </>
  );
}
