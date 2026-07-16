import { create } from 'zustand';

/**
 * Global search overlay state. The dialog hosts search panels contributed
 * by apps via the `sero.app.search` manifest field, and is opened from the
 * main sidebar and the ⌘K command menu.
 */
export interface GlobalSearchState {
  open: boolean;
  /** Contribution to focus when multiple apps contribute a panel. Null = first. */
  activeAppId: string | null;
  openSearch: (appId?: string) => void;
  setActiveAppId: (appId: string) => void;
  setOpen: (open: boolean) => void;
}

export const useGlobalSearchStore = create<GlobalSearchState>((set) => ({
  open: false,
  activeAppId: null,
  openSearch: (appId) => set((state) => ({ open: true, activeAppId: appId ?? state.activeAppId })),
  setActiveAppId: (appId) => set({ activeAppId: appId }),
  setOpen: (open) => set({ open }),
}));
