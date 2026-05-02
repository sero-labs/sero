/**
 * Model Manager — full-screen dialog for managing model visibility
 * and favourites. Opened from the ModelSelector gear icon.
 */

import { Eye, EyeOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { SearchInput } from '@sero-ai/ui/components/ui/search-input';
import { modelKey } from '@/stores/model-preferences';
import { ModelManagerItem } from './ModelManagerItem';
import { ModelManagerProvider } from './ModelManagerProvider';
import { ModelManagerTabBar } from './ModelManagerTabBar';
import { LocalModelsPanel } from './local-models/LocalModelsPanel';
import { useModelManagerState } from './useModelManagerState';

interface ModelManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelManagerDialog({ open, onOpenChange }: ModelManagerDialogProps) {
  const {
    activeTab,
    counts,
    displayGroups,
    emptyMessage,
    favouriteGroups,
    filter,
    handleHideAll,
    handleHideAllIncludingFavourites,
    handleShowAll,
    hasFavouritesInView,
    inputRef,
    isFavourite,
    isHidden,
    isProviderHidden,
    localModels,
    setActiveTab,
    setFilter,
    toggleFavourite,
    toggleHidden,
    toggleProviderHidden,
  } = useModelManagerState(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[520px] !rounded-2xl border-[var(--border-subtle)] !bg-[var(--bg-surface)] !p-0 shadow-2xl shadow-black/50 sm:!max-w-[520px]"
      >
        <DialogTitle className="sr-only">Model Manager</DialogTitle>

        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 pb-3 pt-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Model Manager
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Manage favourites and visibility for {counts.all} models
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <ModelManagerTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts}
          />
          {activeTab !== 'local' ? (
            <SearchInput
              ref={inputRef}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search models, providers…"
              containerClassName="rounded-lg bg-[var(--bg-base)]"
              iconClassName="text-[var(--text-muted)]"
              className="h-8 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              endAdornment={
                filter ? (
                  <button
                    onClick={() => setFilter('')}
                    className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    <X className="size-3" />
                  </button>
                ) : null
              }
            />
          ) : null}
        </div>

        {activeTab === 'local' ? (
          <div className="max-h-[500px] min-h-[200px] overflow-y-auto">
            <LocalModelsPanel localModels={localModels} />
          </div>
        ) : (
          <>
            {activeTab === 'all' && displayGroups.length > 0 ? (
              <div className="flex items-center justify-end gap-1 border-b border-[var(--border-subtle)] px-4 py-1.5">
                <button
                  onClick={handleHideAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                >
                  <EyeOff className="size-3" />
                  {filter ? 'Hide matches' : 'Hide all'}
                </button>
                {hasFavouritesInView ? (
                  <button
                    onClick={handleHideAllIncludingFavourites}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                  >
                    <EyeOff className="size-3" />
                    {filter ? 'incl. favourites' : 'Hide all incl. favourites'}
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeTab === 'hidden' && displayGroups.length > 0 ? (
              <div className="flex items-center justify-end border-b border-[var(--border-subtle)] px-4 py-1.5">
                <button
                  onClick={handleShowAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                >
                  <Eye className="size-3" />
                  Show all
                </button>
              </div>
            ) : null}

            <div className="max-h-[500px] min-h-[200px] overflow-y-auto px-2 py-1">
              <AnimatePresence mode="popLayout">
                {displayGroups.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center px-4 py-10 text-center text-xs text-[var(--text-muted)]"
                  >
                    {emptyMessage}
                  </motion.div>
                ) : activeTab === 'favourites' ? (
                  favouriteGroups.flatMap((group) =>
                    group.models.map((model) => {
                      const key = modelKey(model.provider, model.modelId);
                      return (
                        <ModelManagerItem
                          key={key}
                          model={model}
                          providerLogo={group.logo}
                          providerName={group.displayName}
                          isFavourite={isFavourite(key)}
                          isHidden={isProviderHidden(group.provider) || isHidden(key)}
                          isHiddenByProvider={isProviderHidden(group.provider)}
                          onToggleFavourite={toggleFavourite}
                          onToggleHidden={toggleHidden}
                        />
                      );
                    }),
                  )
                ) : (
                  displayGroups.map((group, index) => (
                    <div key={group.provider}>
                      {index > 0 ? (
                        <div className="mx-3 my-1 border-t border-[var(--border-subtle)]" />
                      ) : null}
                      <ModelManagerProvider
                        group={group}
                        isProviderHidden={isProviderHidden(group.provider)}
                        isFavourite={isFavourite}
                        isHidden={isHidden}
                        onToggleFavourite={toggleFavourite}
                        onToggleHidden={toggleHidden}
                        onToggleProvider={toggleProviderHidden}
                      />
                    </div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
