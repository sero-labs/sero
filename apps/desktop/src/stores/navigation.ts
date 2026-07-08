/**
 * Navigation history — browser-style back/forward across apps.
 *
 * `setActiveApp` pushes an entry on every user navigation; back/forward
 * move the cursor without pushing (callers pass `skipHistory` when
 * re-activating an app from history — see `navigateBack`/`navigateForward`
 * in `@/lib/open-app`). History is session-only, per window.
 *
 * `viewId` is reserved for app sub-views (e.g. a specific Admin tab) so
 * plugins can publish deeper locations later without a store change.
 */

import { create } from 'zustand';

export interface NavEntry {
  appId: string;
  viewId?: string;
}

const HISTORY_LIMIT = 50;

interface NavigationState {
  entries: NavEntry[];
  index: number;
  /** Record a navigation. Drops forward entries; caps at HISTORY_LIMIT. */
  push: (entry: NavEntry) => void;
  /** Move the cursor back/forward. Returns the entry to activate, or null at the edge. */
  back: () => NavEntry | null;
  forward: () => NavEntry | null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  entries: [],
  index: -1,

  push: (entry) => {
    const { entries, index } = get();
    const current = entries[index];
    if (current && current.appId === entry.appId && current.viewId === entry.viewId) return;

    const next = [...entries.slice(0, index + 1), entry];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ entries: next, index: next.length - 1 });
  },

  back: () => {
    const { entries, index } = get();
    if (index <= 0) return null;
    set({ index: index - 1 });
    return entries[index - 1];
  },

  forward: () => {
    const { entries, index } = get();
    if (index >= entries.length - 1) return null;
    set({ index: index + 1 });
    return entries[index + 1];
  },
}));

/** Seed history with the app restored on startup. Call once after layout hydration. */
export function seedNavigationHistory(appId: string): void {
  useNavigationStore.setState({ entries: [{ appId }], index: 0 });
}
