import { modelKey } from '@/stores/model-preferences';
import type { ModelInfo, AvailableModelGroup } from '@/types/ipc';

export type FavouriteModelEntry = {
  group: AvailableModelGroup;
  model: ModelInfo;
};

/** Filter groups by search query, matching on model name or model ID. */
export function filterGroups(
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
        model.modelId.toLowerCase().includes(normalizedQuery),
    );
    if (matches.length > 0) {
      filtered.push({ ...group, models: matches });
    }
  }
  return filtered;
}

/** Remove hidden models/providers before the selector renders them. */
export function applyPreferences(
  groups: AvailableModelGroup[],
  hiddenModels: Set<string>,
  hiddenProviders: Set<string>,
): AvailableModelGroup[] {
  const result: AvailableModelGroup[] = [];
  for (const group of groups) {
    if (hiddenProviders.has(group.provider)) continue;
    const visibleModels = group.models.filter(
      (model) => !hiddenModels.has(modelKey(model.provider, model.modelId)),
    );
    if (visibleModels.length > 0) {
      result.push({ ...group, models: visibleModels });
    }
  }
  return result;
}

/** Build a favourites section from the currently visible groups. */
export function buildFavourites(
  groups: AvailableModelGroup[],
  favouriteKeys: string[],
): FavouriteModelEntry[] {
  if (favouriteKeys.length === 0) return [];
  const favouriteKeySet = new Set(favouriteKeys);
  const result: FavouriteModelEntry[] = [];
  for (const group of groups) {
    for (const model of group.models) {
      if (favouriteKeySet.has(modelKey(model.provider, model.modelId))) {
        result.push({ group, model });
      }
    }
  }
  return result;
}
