import { Settings2 } from 'lucide-react';
import { Popover, PopoverContent } from '@sero-ai/ui/components/ui/popover';
import { SearchInput } from '@sero-ai/ui/components/ui/search-input';
import { ModelManagerDialog } from './model-manager/ModelManagerDialog';
import { ModelSelectorList } from './model-selector/ModelSelectorList';
import { MemoizedModelSelectorTrigger } from './model-selector/ModelSelectorTrigger';
import { ThinkingPicker } from './model-selector/ThinkingPicker';
import { useModelSelectorState } from './model-selector/useModelSelectorState';

export function ModelSelector({ disabled }: { disabled: boolean }) {
  const {
    activeSelectedModel,
    allGroups,
    favouriteKeys,
    favourites,
    filter,
    filteredGroups,
    focusedModelState,
    handleModelSelect,
    handleOpenChange,
    handleOpenManager,
    handleThinkingSelect,
    hasActiveAvailableModel,
    inputRef,
    isPrimed,
    managerOpen,
    open,
    primePopover,
    selectedModelId,
    selectedProvider,
    setFilter,
    setManagerOpen,
    thinkingLevels,
    totalFiltered,
    triggerLabel,
    triggerProviderDisplayName,
    triggerProviderLogo,
    triggerThinkingLabel,
  } = useModelSelectorState();

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <MemoizedModelSelectorTrigger
          disabled={disabled}
          hasActiveAvailableModel={hasActiveAvailableModel}
          label={triggerLabel}
          onPrime={primePopover}
          providerDisplayName={triggerProviderDisplayName}
          providerLogo={triggerProviderLogo}
          thinkingLabel={triggerThinkingLabel}
        />
        <PopoverContent
          forceMount={isPrimed ? true : undefined}
          side="top"
          align="start"
          sideOffset={8}
          className="w-[340px] overflow-hidden rounded-xl border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0 shadow-2xl shadow-black/40 duration-150 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[side=top]:slide-in-from-bottom-0 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0"
        >
          <div>
            <SearchInput
              ref={inputRef}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search models..."
              data-slot="model-filter"
              containerClassName="border-b border-[var(--border-subtle)]"
              iconClassName="text-[var(--text-muted)]"
              className="text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none"
              endAdornment={
                <button type="button"
                  onClick={handleOpenManager}
                  title="Manage models"
                  className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                >
                  <Settings2 className="size-3.5" />
                </button>
              }
            />

            <div className="max-h-[320px] overflow-y-auto py-1">
              <ModelSelectorList
                allGroups={allGroups}
                favouriteKeys={favouriteKeys}
                favourites={favourites}
                filter={filter}
                filteredGroups={filteredGroups}
                onSelect={(model) => handleModelSelect(model.provider, model.modelId)}
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
                totalFiltered={totalFiltered}
              />
            </div>

            <ThinkingPicker
              current={hasActiveAvailableModel ? (focusedModelState?.thinkingLevel ?? 'off') : 'off'}
              available={thinkingLevels}
              disabled={!activeSelectedModel || !activeSelectedModel.reasoning}
              onSelect={handleThinkingSelect}
            />
          </div>
        </PopoverContent>
      </Popover>

      <ModelManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
