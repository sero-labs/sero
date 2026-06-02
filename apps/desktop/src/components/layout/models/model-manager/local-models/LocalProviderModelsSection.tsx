import type { KeyboardEvent } from 'react';
import { Download, Loader2, Plus } from 'lucide-react';
import type { LocalModelEntry } from '@/types/local-models';
import { LocalProviderField } from './LocalProviderField';

interface LocalProviderModelsSectionProps {
  baseUrl: string;
  fetchingModels: boolean;
  models: LocalModelEntry[];
  newModelId: string;
  onFetchModels: () => Promise<void>;
  onNewModelIdChange: (value: string) => void;
  onAddModel: () => void;
  onRemoveModel: (id: string) => void;
}

export function LocalProviderModelsSection({
  baseUrl,
  fetchingModels,
  models,
  newModelId,
  onFetchModels,
  onNewModelIdChange,
  onAddModel,
  onRemoveModel,
}: LocalProviderModelsSectionProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onAddModel();
    }
  };

  return (
    <LocalProviderField label="Models">
      <div className="flex flex-col gap-2">
        <button type="button"
          onClick={() => {
            void onFetchModels();
          }}
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

        {models.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border border-[var(--border-subtle)] p-1.5">
            {models.map((model) => (
              <div
                key={model.id}
                className="group flex items-center justify-between rounded-md px-2 py-1
                  hover:bg-[var(--bg-elevated)]"
              >
                <span className="text-xs text-[var(--text-primary)]">
                  {model.name ?? model.id}
                  {model.name && model.name !== model.id && (
                    <span className="ml-1.5 text-[var(--text-muted)]">{model.id}</span>
                  )}
                </span>
                <button type="button"
                  onClick={() => onRemoveModel(model.id)}
                  className="text-[10px] text-[var(--text-muted)] opacity-0
                    transition-opacity group-hover:opacity-100 hover:text-status-error"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <input aria-label="Model ID"
            value={newModelId}
            onChange={(event) => onNewModelIdChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Model ID (e.g. llama3.1:8b)"
            className="h-7 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
              px-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
              outline-none focus:border-[var(--border-focus)]"
          />
          <button type="button"
            onClick={onAddModel}
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
    </LocalProviderField>
  );
}
