/**
 * Local models management panel, shows configured local LLM providers
 * and allows adding, editing, and removing them.
 *
 * Appears as the "Local" tab in the Model Manager dialog.
 */

import { useState, useCallback, memo } from 'react';
import { Plus, RefreshCw, Settings2, Trash2, Server, ChevronRight, TriangleAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import type { LocalProviderConfig } from '@/types/local-models';
import type { UseLocalModelsReturn } from './use-local-models';
import { LocalProviderForm } from './LocalProviderForm';

interface LocalModelsPanelProps {
  localModels: UseLocalModelsReturn;
}

function getProviderModels(config: LocalProviderConfig) {
  return config.models ?? [];
}

/** A single configured provider row. */
const ProviderRow = memo(function ProviderRow({
  name,
  config,
  onEdit,
  onRemove,
}: {
  name: string;
  config: LocalProviderConfig;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const models = getProviderModels(config);

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] transition-colors hover:border-[var(--border-default)]">
      {/* Provider header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <Server className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-[var(--text-primary)]">{name}</span>
            <span className="truncate text-sm text-[var(--text-muted)]">
              {config.baseUrl ?? 'Override-only provider'}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--bg-muted)] px-1.5 py-px text-sm font-semibold text-[var(--text-muted)]">
            {models.length} {models.length === 1 ? 'model' : 'models'}
          </span>
          <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRight className="size-3 text-[var(--text-muted)]" />
          </motion.div>
        </button>

        <div className="flex items-center gap-0.5">
          <button type="button"
            onClick={() => onEdit(name)}
            title="Edit provider"
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors
              hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <Settings2 className="size-3.5" />
          </button>
          <button type="button"
            onClick={() => onRemove(name)}
            title="Remove provider"
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors
              hover:bg-[var(--bg-elevated)] hover:text-status-error"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded model list */}
      <AnimatePresence initial={false}>
        {expanded && models.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-[var(--border-subtle)]"
          >
            <div className="px-3 py-1.5">
              {models.map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-1">
                  <div className="size-1.5 rounded-full bg-[var(--border-default)]" />
                  <span className="text-xs text-[var(--text-secondary)]">{m.name ?? m.id}</span>
                  {m.reasoning && (
                    <span className="text-sm text-status-warning">reasoning</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export function LocalModelsPanel({ localModels }: LocalModelsPanelProps) {
  const { config, loading, error, warning } = localModels;
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const clearConfirmRemove = useDebouncedCallback((name: string) => {
    setConfirmRemove((current) => current === name ? null : current);
  }, 3000);

  const providers = config?.providers ?? {};
  const providerNames = Object.keys(providers);

  const handleEdit = useCallback((name: string) => {
    setEditingProvider(name);
    setView('edit');
  }, []);

  const handleRemove = useCallback(async (name: string) => {
    if (confirmRemove === name) {
      await localModels.removeProvider(name);
      setConfirmRemove(null);
      return;
    }
    setConfirmRemove(name);
    clearConfirmRemove(name);
  }, [clearConfirmRemove, confirmRemove, localModels]);

  const handleSaveProvider = useCallback(async (name: string, providerConfig: LocalProviderConfig) => {
    if (view === 'edit' && editingProvider) {
      if (editingProvider !== name) {
        await localModels.renameProvider(editingProvider, name);
      }
      await localModels.updateProvider(name, providerConfig);
    } else {
      await localModels.addProvider(name, providerConfig);
    }
    setView('list');
    setEditingProvider(null);
  }, [editingProvider, localModels, view]);

  const handleCancel = useCallback(() => {
    setView('list');
    setEditingProvider(null);
  }, []);

  if (error) {
    return <ErrorState error={error} onRetry={localModels.reload} />;
  }

  // Show form when adding/editing
  if (view === 'add' || view === 'edit') {
    const existing = view === 'edit' && editingProvider && providers[editingProvider]
      ? { name: editingProvider, config: providers[editingProvider] }
      : null;

    return (
      <LocalProviderForm
        existing={existing}
        existingNames={providerNames}
        onSave={handleSaveProvider}
        onCancel={handleCancel}
        onTestConnection={localModels.testConnection}
        onFetchModels={localModels.fetchRemoteModels}
      />
    );
  }

  // List view
  return (
    <div className="flex flex-col gap-3 p-3">
      {warning && (
        <div className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
          <span>{warning}</span>
        </div>
      )}
      {/* Header + Add button */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          {providerNames.length === 0
            ? 'Add a local LLM server to use models from Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint.'
            : `${providerNames.length} local ${providerNames.length === 1 ? 'provider' : 'providers'} configured`}
        </p>
        <button type="button"
          onClick={() => setView('add')}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-subtle)]
            px-2.5 text-sm font-medium text-[var(--text-secondary)]
            transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <Plus className="size-3" />
          Add Provider
        </button>
      </div>

      {loading && (
        <div className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</div>
      )}

      {!loading && providerNames.length === 0 && (
        <EmptyState onAdd={() => setView('add')} />
      )}

      {!loading && providerNames.length > 0 && (
        <div className="flex flex-col gap-2">
          {providerNames.map((name) => (
            <div key={name}>
              <ProviderRow
                name={name}
                config={providers[name]}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
              {confirmRemove === name && (
                <p className="mt-1 text-center text-sm text-status-error">
                  Click remove again to confirm
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="rounded-lg bg-status-error/10 px-3 py-2 text-xs text-status-error">
        {error}
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Fix the invalid models.json entry before adding or editing providers here.
      </p>
      <button type="button"
        onClick={() => { void onRetry(); }}
        className="flex h-8 items-center gap-1.5 self-start rounded-md border border-[var(--border-subtle)]
          px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors
          hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <RefreshCw className="size-3.5" />
        Retry
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Server className="size-8 text-[var(--text-muted)]/40" />
      <div className="text-center">
        <p className="text-xs font-medium text-[var(--text-secondary)]">No local providers</p>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Connect Ollama, LM Studio, vLLM, or any OpenAI-compatible server
        </p>
      </div>
      <button type="button"
        onClick={onAdd}
        className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--banner-primary)]
          px-3 text-xs font-medium text-white transition-colors
          hover:bg-[var(--banner-primary)]/80"
      >
        <Plus className="size-3.5" />
        Add Provider
      </button>
    </div>
  );
}
