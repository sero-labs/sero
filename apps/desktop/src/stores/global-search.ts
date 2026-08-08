import { create } from 'zustand';

/**
 * Global search overlay state. The dialog hosts search panels contributed
 * by apps at `ui.global-search.panel`, and is opened from the
 * main sidebar and the ⌘K command menu.
 */
export interface GlobalSearchState {
  open: boolean;
  /** Contribution to focus when multiple apps contribute a panel. Null = first. */
  activeContributionKey: string | null;
  openSearch: (contributionKey?: string) => void;
  setActiveContributionKey: (contributionKey: string) => void;
  setOpen: (open: boolean) => void;
}

export const useGlobalSearchStore = create<GlobalSearchState>((set) => ({
  open: false,
  activeContributionKey: null,
  openSearch: (contributionKey) => set((state) => ({
    open: true,
    activeContributionKey: contributionKey ?? state.activeContributionKey,
  })),
  setActiveContributionKey: (contributionKey) => set({ activeContributionKey: contributionKey }),
  setOpen: (open) => set({ open }),
}));
