import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAgentStore } from '@/stores/agent';
import { useFocusedModelState, useFocusedSessionId } from '@/stores/agent-selectors';
import { modelKey, useModelPreferences } from '@/stores/model-preferences';
import { useLocalModels } from './local-models';
import type { ManagerTab } from './types';
import {
  buildManagerCollections,
  buildManagerCounts,
  filterManagerGroups,
  getManagerEmptyMessage,
} from './runtime';

export function useModelManagerState(open: boolean) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('all');
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const modelState = useFocusedModelState();
  const focusedSessionId = useFocusedSessionId();
  const fetchModelState = useAgentStore((state) => state.fetchModelState);
  const groups = modelState?.availableModels ?? [];

  const refreshFocusedModels = useCallback(async () => {
    if (!focusedSessionId) return;
    await fetchModelState(focusedSessionId);
  }, [fetchModelState, focusedSessionId]);

  const localModels = useLocalModels({ onSaved: refreshFocusedModels });
  const localProviderCount = Object.keys(localModels.config?.providers ?? {}).length;

  const preferences = useModelPreferences();
  const {
    favouriteModels,
    hiddenModels,
    hiddenProviders,
    hideAll,
    showAll,
    toggleFavourite,
    toggleHidden,
    toggleProviderHidden,
  } = preferences;

  const isFavourite = useCallback(
    (key: string) => favouriteModels.includes(key),
    [favouriteModels],
  );
  const isHidden = useCallback(
    (key: string) => hiddenModels.includes(key),
    [hiddenModels],
  );
  const isProviderHidden = useCallback(
    (provider: string) => hiddenProviders.includes(provider),
    [hiddenProviders],
  );

  const filteredGroups = useMemo(
    () => filterManagerGroups(groups, filter),
    [filter, groups],
  );

  const { favouriteGroups, hiddenGroups } = useMemo(
    () =>
      buildManagerCollections(filteredGroups, {
        favouriteModels,
        hiddenModels,
        hiddenProviders,
      }),
    [favouriteModels, filteredGroups, hiddenModels, hiddenProviders],
  );

  const counts = useMemo(
    () =>
      buildManagerCounts(
        groups,
        {
          favouriteModels,
          hiddenModels,
          hiddenProviders,
        },
        localProviderCount,
      ),
    [favouriteModels, groups, hiddenModels, hiddenProviders, localProviderCount],
  );

  const allVisibleKeys = useMemo(
    () =>
      filteredGroups.flatMap((group) =>
        group.models.map((model) => modelKey(model.provider, model.modelId)),
      ),
    [filteredGroups],
  );

  const hasFavouritesInView = useMemo(() => {
    const favouriteSet = new Set(favouriteModels);
    return allVisibleKeys.some((key) => favouriteSet.has(key));
  }, [allVisibleKeys, favouriteModels]);

  const handleHideAll = useCallback(() => {
    const favouriteSet = new Set(favouriteModels);
    const keys = allVisibleKeys.filter((key) => !favouriteSet.has(key));
    if (keys.length > 0) {
      hideAll(keys);
    }
  }, [allVisibleKeys, favouriteModels, hideAll]);

  const handleHideAllIncludingFavourites = useCallback(() => {
    if (allVisibleKeys.length > 0) {
      hideAll(allVisibleKeys);
    }
  }, [allVisibleKeys, hideAll]);

  const handleShowAll = useCallback(() => {
    showAll();
  }, [showAll]);

  useEffect(() => {
    if (!open) return;
    setFilter('');
    setActiveTab('all');
    void localModels.reload();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [localModels.reload, open]);

  const displayGroups =
    activeTab === 'favourites'
      ? favouriteGroups
      : activeTab === 'hidden'
        ? hiddenGroups
        : filteredGroups;

  const emptyMessage = getManagerEmptyMessage(activeTab, filter);

  return {
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
  };
}
