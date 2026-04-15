import { modelKey } from '@/stores/model-preferences';
import type { AvailableModelGroup, ManagerTab } from './types';

export interface ModelManagerPreferenceSnapshot {
  favouriteModels: string[];
  hiddenModels: string[];
  hiddenProviders: string[];
}

export interface ModelManagerCollections {
  favouriteGroups: AvailableModelGroup[];
  hiddenGroups: AvailableModelGroup[];
}

export function filterManagerGroups(
  groups: AvailableModelGroup[],
  query: string,
): AvailableModelGroup[] {
  if (!query) return groups;
  const normalizedQuery = query.toLowerCase();
  const filtered: AvailableModelGroup[] = [];

  for (const group of groups) {
    const matches = group.models.filter(
      (model) =>
        model.name.toLowerCase().includes(normalizedQuery) ||
        model.modelId.toLowerCase().includes(normalizedQuery) ||
        group.displayName.toLowerCase().includes(normalizedQuery),
    );
    if (matches.length > 0) {
      filtered.push({ ...group, models: matches });
    }
  }

  return filtered;
}

export function buildManagerCollections(
  groups: AvailableModelGroup[],
  preferences: ModelManagerPreferenceSnapshot,
): ModelManagerCollections {
  const favouriteKeys = new Set(preferences.favouriteModels);
  const hiddenKeys = new Set(preferences.hiddenModels);
  const hiddenProviders = new Set(preferences.hiddenProviders);
  const favouriteGroups: AvailableModelGroup[] = [];
  const hiddenGroups: AvailableModelGroup[] = [];

  for (const group of groups) {
    const favouriteModels = group.models.filter((model) =>
      favouriteKeys.has(modelKey(model.provider, model.modelId)),
    );
    const hiddenModels = group.models.filter(
      (model) =>
        hiddenKeys.has(modelKey(model.provider, model.modelId)) ||
        hiddenProviders.has(model.provider),
    );

    if (favouriteModels.length > 0) {
      favouriteGroups.push({ ...group, models: favouriteModels });
    }
    if (hiddenModels.length > 0) {
      hiddenGroups.push({ ...group, models: hiddenModels });
    }
  }

  return { favouriteGroups, hiddenGroups };
}

export function buildManagerCounts(
  groups: AvailableModelGroup[],
  preferences: ModelManagerPreferenceSnapshot,
  localProviderCount: number,
): Record<ManagerTab, number> {
  const hiddenSet = new Set(preferences.hiddenModels);
  for (const group of groups) {
    if (!preferences.hiddenProviders.includes(group.provider)) continue;
    for (const model of group.models) {
      hiddenSet.add(modelKey(model.provider, model.modelId));
    }
  }

  return {
    all: groups.reduce((total, group) => total + group.models.length, 0),
    favourites: preferences.favouriteModels.length,
    hidden: hiddenSet.size,
    local: localProviderCount,
  };
}

export function getManagerEmptyMessage(activeTab: ManagerTab, filter: string): string {
  if (activeTab === 'favourites') {
    return 'No favourite models yet. Click the star icon to add favourites.';
  }
  if (activeTab === 'hidden') {
    return 'No hidden models. Click the eye icon to hide models from the selector.';
  }
  if (filter) {
    return `No models matching "${filter}"`;
  }
  return 'No models available.';
}
