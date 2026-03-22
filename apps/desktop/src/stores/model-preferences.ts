/**
 * Model preferences store — manages favourite and hidden models.
 *
 * Preferences are keyed by `provider/modelId` strings. Persisted to
 * ~/.sero-ui/layout.json via the shared `persistLayout` helper.
 */

import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';

/** Canonical key for a model: "provider/modelId". */
export type ModelKey = string;

export function modelKey(provider: string, modelId: string): ModelKey {
  return `${provider}/${modelId}`;
}

interface ModelPreferencesState {
  /** Models pinned to the top of the selector. */
  favouriteModels: ModelKey[];
  /** Models hidden from the selector list. */
  hiddenModels: ModelKey[];
  /** Provider IDs that are entirely hidden from the selector. */
  hiddenProviders: string[];

  toggleFavourite: (key: ModelKey) => void;
  toggleHidden: (key: ModelKey) => void;
  toggleProviderHidden: (provider: string) => void;

  /** Bulk-set from loaded layout state. */
  hydrate: (data: {
    favouriteModels?: ModelKey[];
    hiddenModels?: ModelKey[];
    hiddenProviders?: string[];
  }) => void;
}

function persistModelPrefs(state: Pick<ModelPreferencesState, 'favouriteModels' | 'hiddenModels' | 'hiddenProviders'>) {
  persistLayout({
    favouriteModels: state.favouriteModels,
    hiddenModels: state.hiddenModels,
    hiddenProviders: state.hiddenProviders,
  });
}

export const useModelPreferences = create<ModelPreferencesState>((set, get) => ({
  favouriteModels: [],
  hiddenModels: [],
  hiddenProviders: [],

  toggleFavourite: (key) => {
    const current = get().favouriteModels;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    set({ favouriteModels: next });
    persistModelPrefs(get());
  },

  toggleHidden: (key) => {
    const current = get().hiddenModels;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    // Also remove from favourites if hiding
    const favs = next.includes(key)
      ? get().favouriteModels.filter((k) => k !== key)
      : get().favouriteModels;
    set({ hiddenModels: next, favouriteModels: favs });
    persistModelPrefs(get());
  },

  toggleProviderHidden: (provider) => {
    const current = get().hiddenProviders;
    const next = current.includes(provider)
      ? current.filter((p) => p !== provider)
      : [...current, provider];
    set({ hiddenProviders: next });
    persistModelPrefs(get());
  },

  hydrate: (data) => {
    set({
      favouriteModels: data.favouriteModels ?? [],
      hiddenModels: data.hiddenModels ?? [],
      hiddenProviders: data.hiddenProviders ?? [],
    });
  },
}));
