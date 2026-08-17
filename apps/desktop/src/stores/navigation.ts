/**
 * Navigation history — browser-style back/forward across apps.
 *
 * `setActiveApp` pushes an entry on every user navigation; back/forward
 * move the cursor without pushing (callers pass `skipHistory` when
 * re-activating an app from history — see `navigateBack`/`navigateForward`
 * in `@/lib/open-app`). History is session-only, per window.
 *
 * `viewId` identifies an app sub-view. Apps publish these locations through
 * `useAppNavigation`, so shell back/forward also moves inside an app.
 */

import { create } from 'zustand';

export interface NavEntry {
  appId: string;
  viewId?: string;
  /** Workspace for a workspace-scoped app; absent for global apps. */
  workspaceId?: string;
}

export type NavigationDirection = -1 | 1;

export interface NavigationTarget {
  entry: NavEntry;
  index: number;
}

const HISTORY_LIMIT = 50;

interface NavigationState {
  entries: NavEntry[];
  index: number;
  /** Record a navigation. Drops forward entries; caps at HISTORY_LIMIT. */
  push: (entry: NavEntry) => void;
  /** Set the first view after an app opens, or push a later view change. */
  publishView: (entry: NavEntry & { viewId: string }, replace?: boolean) => void;
  /** Replace the current location without adding history. */
  replaceCurrent: (entry: NavEntry) => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  entries: [],
  index: -1,

  push: (entry) => {
    const { entries, index } = get();
    const current = entries[index];
    if (current
      && current.appId === entry.appId
      && current.viewId === entry.viewId
      && current.workspaceId === entry.workspaceId) return;

    const next = [...entries.slice(0, index + 1), entry];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ entries: next, index: next.length - 1 });
  },

  publishView: (entry, replace = false) => {
    const { entries, index } = get();
    if (index < 0) {
      get().push(entry);
      return;
    }
    const current = entries[index];
    if (replace || (current?.appId === entry.appId
      && current.workspaceId === entry.workspaceId
      && current.viewId === undefined)) {
      const next = [...entries];
      next[index] = entry;
      set({ entries: next });
      return;
    }
    get().push(entry);
  },

  replaceCurrent: (entry) => {
    const { entries, index } = get();
    if (index < 0) return;
    const next = [...entries];
    next[index] = entry;
    set({ entries: next });
  },
}));

export function findNavigationTarget(
  entries: NavEntry[],
  index: number,
  direction: NavigationDirection,
  canUse: (entry: NavEntry) => boolean,
): NavigationTarget | null {
  for (let cursor = index + direction; cursor >= 0 && cursor < entries.length; cursor += direction) {
    const entry = entries[cursor];
    if (entry && canUse(entry)) return { entry, index: cursor };
  }
  return null;
}

/** Seed history with the app restored on startup. Call once after layout hydration. */
export function seedNavigationHistory(appId: string, viewId?: string, workspaceId?: string): void {
  useNavigationStore.setState({ entries: [{ appId, viewId, workspaceId }], index: 0 });
}
