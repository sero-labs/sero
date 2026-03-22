/**
 * Model Manager — full-screen dialog for managing model visibility
 * and favourites. Opened from the ModelSelector gear icon.
 */

import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { Search, Star, EyeOff, Layers, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@sero/ui/components/ui/dialog';
import { useFocusedModelState } from '@/stores/agent-selectors';
import { useModelPreferences, modelKey } from '@/stores/model-preferences';
import type { AvailableModelGroup, ManagerTab } from './types';
import { ModelManagerProvider } from './ModelManagerProvider';
import { ModelManagerItem } from './ModelManagerItem';

/** Filter groups by search query. */
function filterManagerGroups(
  groups: AvailableModelGroup[],
  query: string,
): AvailableModelGroup[] {
  if (!query) return groups;
  const q = query.toLowerCase();
  const filtered: AvailableModelGroup[] = [];
  for (const group of groups) {
    const matches = group.models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q) ||
        group.displayName.toLowerCase().includes(q),
    );
    if (matches.length) filtered.push({ ...group, models: matches });
  }
  return filtered;
}

const TAB_CONFIG: { id: ManagerTab; label: string; icon: typeof Star }[] = [
  { id: 'all', label: 'All Models', icon: Layers },
  { id: 'favourites', label: 'Favourites', icon: Star },
  { id: 'hidden', label: 'Hidden', icon: EyeOff },
];

interface ModelManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Stable tab bar with animated indicator. */
const TabBar = memo(function TabBar({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: ManagerTab;
  onTabChange: (tab: ManagerTab) => void;
  counts: Record<ManagerTab, number>;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--bg-base)] p-1">
      {TAB_CONFIG.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              active
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {active && (
              <motion.div
                layoutId="manager-tab-bg"
                className="absolute inset-0 rounded-md bg-[var(--bg-elevated)]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {tab.label}
              {counts[tab.id] > 0 && (
                <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-muted)]">
                  {counts[tab.id]}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export function ModelManagerDialog({ open, onOpenChange }: ModelManagerDialogProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('all');
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ms = useFocusedModelState();
  const groups = ms?.availableModels ?? [];

  const prefs = useModelPreferences();
  const { toggleFavourite, toggleHidden, toggleProviderHidden } = prefs;

  // Stable lookup callbacks for memoized children
  const isFavourite = useCallback(
    (key: string) => prefs.favouriteModels.includes(key),
    [prefs.favouriteModels],
  );
  const isHidden = useCallback(
    (key: string) => prefs.hiddenModels.includes(key),
    [prefs.hiddenModels],
  );
  const isProviderHidden = useCallback(
    (provider: string) => prefs.hiddenProviders.includes(provider),
    [prefs.hiddenProviders],
  );

  // Filtered groups based on search
  const filteredGroups = useMemo(
    () => filterManagerGroups(groups, filter),
    [groups, filter],
  );

  // Build tab-specific model lists
  const { favouriteGroups, hiddenGroups } = useMemo(() => {
    const favKeys = new Set(prefs.favouriteModels);
    const hidKeys = new Set(prefs.hiddenModels);
    const hidProviders = new Set(prefs.hiddenProviders);

    const favGroups: AvailableModelGroup[] = [];
    const hidGroups: AvailableModelGroup[] = [];

    for (const group of filteredGroups) {
      const favModels = group.models.filter(
        (m) => favKeys.has(modelKey(m.provider, m.modelId)),
      );
      const hidModels = group.models.filter(
        (m) =>
          hidKeys.has(modelKey(m.provider, m.modelId)) ||
          hidProviders.has(m.provider),
      );
      if (favModels.length) favGroups.push({ ...group, models: favModels });
      if (hidModels.length) hidGroups.push({ ...group, models: hidModels });
    }
    return { favouriteGroups: favGroups, hiddenGroups: hidGroups };
  }, [filteredGroups, prefs.favouriteModels, prefs.hiddenModels, prefs.hiddenProviders]);

  const counts: Record<ManagerTab, number> = useMemo(() => {
    // Deduplicate: a model individually hidden whose provider is also hidden
    // should only be counted once.
    const hiddenSet = new Set(prefs.hiddenModels);
    for (const group of groups) {
      if (prefs.hiddenProviders.includes(group.provider)) {
        for (const m of group.models) {
          hiddenSet.add(modelKey(m.provider, m.modelId));
        }
      }
    }
    return {
      all: groups.reduce((n, g) => n + g.models.length, 0),
      favourites: prefs.favouriteModels.length,
      hidden: hiddenSet.size,
    };
  }, [groups, prefs.favouriteModels, prefs.hiddenModels, prefs.hiddenProviders]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setFilter('');
        setActiveTab('all');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const displayGroups =
    activeTab === 'favourites'
      ? favouriteGroups
      : activeTab === 'hidden'
        ? hiddenGroups
        : filteredGroups;

  const emptyMessage =
    activeTab === 'favourites'
      ? 'No favourite models yet. Click the star icon to add favourites.'
      : activeTab === 'hidden'
        ? 'No hidden models. Click the eye icon to hide models from the selector.'
        : filter
          ? `No models matching "${filter}"`
          : 'No models available.';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[520px] !rounded-2xl border-[var(--border-subtle)] !bg-[var(--bg-surface)]
          !p-0 shadow-2xl shadow-black/50 sm:!max-w-[520px]"
      >
        <DialogTitle className="sr-only">Model Manager</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 pt-4 pb-3">
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
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors
              hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
          <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-base)] px-3">
            <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search models, providers…"
              className="h-8 w-full bg-transparent text-xs text-[var(--text-primary)]
                placeholder:text-[var(--text-muted)] outline-none"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Model list */}
        <div className="max-h-[400px] min-h-[200px] overflow-y-auto px-2 py-1">
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
              // Flat list for favourites tab — no provider grouping
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
                      isHidden={isHidden(key)}
                      onToggleFavourite={toggleFavourite}
                      onToggleHidden={toggleHidden}
                    />
                  );
                }),
              )
            ) : (
              displayGroups.map((group, i) => (
                <div key={group.provider}>
                  {i > 0 && (
                    <div className="mx-3 my-1 border-t border-[var(--border-subtle)]" />
                  )}
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
      </DialogContent>
    </Dialog>
  );
}
