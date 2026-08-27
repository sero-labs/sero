import { useMemo, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Popover, PopoverContent } from '@sero-ai/ui/components/ui/popover';
import { SearchInput } from '@sero-ai/ui/components/ui/search-input';
import { ThinkingPicker } from '@sero-ai/ui/model-selection/thinking-picker';
import { THINKING_LABELS, isThinkingLevel, resolveSupportedThinkingLevel } from '@sero-ai/common';
import type { AvailableModelGroup } from '@/types/ipc';
import type { AgentNodeInfo, AgentNodeModel, AgentNodeSession } from '@/types/agent-node';
import { useNodesStore } from '@/stores/nodes';
import { useModelPreferences } from '@/stores/model-preferences';
import { ModelSelectorList } from '@/components/layout/models/model-selector/ModelSelectorList';
import { MemoizedModelSelectorTrigger } from '@/components/layout/models/model-selector/ModelSelectorTrigger';
import {
  applyPreferences,
  buildFavourites,
  filterGroups,
} from '@/components/layout/models/model-selector/filtering';
import { canManageNode } from './node-display';
import { NodeSettingsDialog } from './NodeSettingsDialog';

const EMPTY_MODELS: AgentNodeModel[] = [];

function modelReference(model: AgentNodeModel): string {
  return `${model.providerId}/${model.modelId}`;
}

function providerDisplayName(providerId: string): string {
  const displayNames: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    'openai-codex': 'OpenAI Codex',
    xai: 'xAI',
  };
  if (displayNames[providerId]) return displayNames[providerId];
  return providerId
    .split('-')
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function groupModels(models: AgentNodeModel[]): AvailableModelGroup[] {
  const groups = new Map<string, AgentNodeModel[]>();
  for (const model of models) {
    groups.set(model.providerId, [...(groups.get(model.providerId) ?? []), model]);
  }
  return [...groups].map(([provider, providerModels]) => ({
    provider,
    displayName: providerDisplayName(provider),
    logo: '',
    models: providerModels.map((model) => ({
      provider: model.providerId,
      modelId: model.modelId,
      name: model.name,
      reasoning: model.reasoning,
      availableThinkingLevels: model.availableThinkingLevels,
      supportsXhigh: model.availableThinkingLevels.includes('xhigh'),
      supportsMax: model.availableThinkingLevels.includes('max'),
    })),
  }));
}

export function RemoteModelSelector({ node, session }: { node: AgentNodeInfo; session: AgentNodeSession }) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const models = useNodesStore((state) => state.models[node.id] ?? EMPTY_MODELS);
  const loadModels = useNodesStore((state) => state.loadModels);
  const setSessionModel = useNodesStore((state) => state.setSessionModel);
  const setSessionThinkingLevel = useNodesStore((state) => state.setSessionThinkingLevel);
  const preferences = useModelPreferences();
  const allGroups = useMemo(() => groupModels(models), [models]);
  const hiddenModels = useMemo(() => new Set(preferences.hiddenModels), [preferences.hiddenModels]);
  const hiddenProviders = useMemo(() => new Set(preferences.hiddenProviders), [preferences.hiddenProviders]);
  const favouriteKeys = useMemo(() => new Set(preferences.favouriteModels), [preferences.favouriteModels]);
  const visibleGroups = useMemo(
    () => applyPreferences(allGroups, hiddenModels, hiddenProviders),
    [allGroups, hiddenModels, hiddenProviders],
  );
  const filteredGroups = useMemo(() => filterGroups(visibleGroups, filter), [filter, visibleGroups]);
  const favourites = useMemo(
    () => filter ? [] : buildFavourites(visibleGroups, preferences.favouriteModels),
    [filter, preferences.favouriteModels, visibleGroups],
  );
  const [selectedProvider, selectedModelId] = session.model.split('/', 2);
  const selectedModel = models.find((model) => modelReference(model) === session.model);
  const controlAvailable = canManageNode(node);

  const refreshModels = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadModels(node.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load models');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setFilter('');
    void refreshModels();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <MemoizedModelSelectorTrigger
          ariaLabel="Remote session model"
          className="min-w-0 flex-1 text-left"
          disabled={!controlAvailable}
          hasActiveAvailableModel={Boolean(selectedModel)}
          label={selectedModel?.name ?? session.model}
          labelClassName="max-w-none flex-1 text-left"
          onPrime={() => undefined}
          providerDisplayName={selectedProvider ?? null}
          providerLogo={null}
          thinkingLabel={selectedModel?.reasoning && session.thinkingLevel !== 'off'
            ? THINKING_LABELS[session.thinkingLevel]
            : null}
        />
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[340px] overflow-hidden rounded-xl border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0 shadow-2xl shadow-black/40"
        >
          <SearchInput
            ref={inputRef}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search models..."
            containerClassName="border-b border-[var(--border-subtle)]"
            endAdornment={(
              <button
                type="button"
                aria-label="Open node model settings"
                title="Node model settings"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                onClick={() => { setOpen(false); setSettingsOpen(true); }}
              >
                <Settings2 className="size-3.5" />
              </button>
            )}
          />
          <div className="max-h-[320px] overflow-y-auto py-1">
            <ModelSelectorList
              allGroups={allGroups}
              favouriteKeys={favouriteKeys}
              favourites={favourites}
              filter={filter}
              filteredGroups={filteredGroups}
              onSelect={(model) => {
                setOpen(false);
                const thinkingLevel = resolveSupportedThinkingLevel(model, session.thinkingLevel);
                void setSessionModel(node.id, session.id, `${model.provider}/${model.modelId}`)
                  .then(() => thinkingLevel === session.thinkingLevel
                    ? undefined
                    : setSessionThinkingLevel(node.id, session.id, thinkingLevel));
              }}
              selectedModelId={selectedModelId ?? null}
              selectedProvider={selectedProvider ?? null}
              showProviderLogos={false}
              totalFiltered={filteredGroups.reduce((count, group) => count + group.models.length, 0)}
              emptyContent={loading
                ? 'Loading models…'
                : loadError ?? 'No models are available. Configure a provider in Node settings.'}
            />
          </div>
          <ThinkingPicker
            current={selectedModel?.reasoning ? session.thinkingLevel : 'off'}
            available={selectedModel?.availableThinkingLevels ?? ['off']}
            disabled={!selectedModel?.reasoning || !controlAvailable}
            onSelect={(level) => {
              if (isThinkingLevel(level)) void setSessionThinkingLevel(node.id, session.id, level);
            }}
            className="border-t"
          />
        </PopoverContent>
      </Popover>
      <NodeSettingsDialog node={node} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
