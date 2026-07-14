import { memo } from 'react';
import { Check, Sparkles, Star } from 'lucide-react';
import { modelKey } from '@/stores/model-preferences';
import type { ModelInfo, AvailableModelGroup } from '@/types/ipc';
import type { FavouriteModelEntry } from './filtering';

const ModelItem = memo(function ModelItem({
  isFavourite,
  isSelected,
  model,
  onSelect,
}: {
  isFavourite: boolean;
  isSelected: boolean;
  model: ModelInfo;
  onSelect: (model: ModelInfo) => void;
}) {
  return (
    <button type="button"
      onClick={() => onSelect(model)}
      className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 active:scale-[0.98] ${
        isSelected
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-primary)]'
      }`}
    >
      <div className="flex size-4 shrink-0 items-center justify-center">
        {isSelected ? (
          <Check className="size-3.5 scale-100 text-[var(--brand-primary)] transition-transform duration-150" />
        ) : isFavourite ? (
          <Star className="size-3 text-amber-400" fill="currentColor" />
        ) : (
          <div className="size-1.5 rounded-full bg-[var(--border-default)] transition-colors group-hover:bg-[var(--text-muted)]" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{model.name}</span>
        {model.reasoning ? (
          <Sparkles className="size-3 shrink-0 text-[var(--accent-primary)]/60" />
        ) : null}
      </div>
    </button>
  );
});

const ProviderSection = memo(function ProviderSection({
  favouriteKeys,
  group,
  onSelect,
  selectedModelId,
  selectedProvider,
}: {
  favouriteKeys: Set<string>;
  group: AvailableModelGroup;
  onSelect: (model: ModelInfo) => void;
  selectedModelId: string | null;
  selectedProvider: string | null;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <img src={group.logo} alt={group.displayName} className="size-3.5 rounded-sm dark:invert" />
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {group.displayName}
        </span>
      </div>
      <div className="px-1">
        {group.models.map((model) => (
          <ModelItem
            key={`${model.provider}/${model.modelId}`}
            model={model}
            isFavourite={favouriteKeys.has(modelKey(model.provider, model.modelId))}
            isSelected={selectedProvider === model.provider && selectedModelId === model.modelId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
});

export function ModelSelectorList({
  allGroups,
  favouriteKeys,
  favourites,
  filter,
  filteredGroups,
  onSelect,
  selectedModelId,
  selectedProvider,
  totalFiltered,
}: {
  allGroups: AvailableModelGroup[];
  favouriteKeys: Set<string>;
  favourites: FavouriteModelEntry[];
  filter: string;
  filteredGroups: AvailableModelGroup[];
  onSelect: (model: ModelInfo) => void;
  selectedModelId: string | null;
  selectedProvider: string | null;
  totalFiltered: number;
}) {
  if (allGroups.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
        No models available. Run{' '}
        <code className="rounded bg-[var(--bg-muted)] px-1 font-mono">pi auth</code> to add a
        provider.
      </div>
    );
  }

  if (totalFiltered === 0 && favourites.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
        No models matching <span className="text-[var(--text-secondary)]">"{filter}"</span>
      </div>
    );
  }

  return (
    <>
      {favourites.length > 0 ? (
        <div className="py-1">
          <div className="flex items-center gap-2 px-3 pb-1 pt-2">
            <Star className="size-3 text-amber-400" fill="currentColor" />
            <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Favourites
            </span>
          </div>
          <div className="px-1">
            {favourites.map(({ model }) => (
              <ModelItem
                key={`fav-${model.provider}/${model.modelId}`}
                model={model}
                isFavourite
                isSelected={selectedProvider === model.provider && selectedModelId === model.modelId}
                onSelect={onSelect}
              />
            ))}
          </div>
          <div className="mx-3 mt-1 border-t border-[var(--border-subtle)]" />
        </div>
      ) : null}

      {filteredGroups.map((group, index) => (
        <div key={group.provider}>
          {index > 0 ? <div className="mx-3 border-t border-[var(--border-subtle)]" /> : null}
          <ProviderSection
            group={group}
            favouriteKeys={favouriteKeys}
            onSelect={onSelect}
            selectedModelId={selectedModelId}
            selectedProvider={selectedProvider}
          />
        </div>
      ))}
    </>
  );
}
