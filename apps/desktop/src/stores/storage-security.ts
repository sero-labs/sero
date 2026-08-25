/**
 * Storage security store — whether saved credentials are really protected.
 *
 * On Linux with no keyring, Electron reports encryption as available while
 * Chromium encrypts under a published constant key. The main process detects
 * that and reports it here, so the UI can say so instead of implying safety.
 *
 * The state is read once at startup: the keyring backend cannot change while
 * Sero is running, so there is nothing to subscribe to.
 *
 * Dismissing hides the banner only, and is persisted as `storageWarningDismissed`.
 * The status-bar indicator ignores dismissal, so the condition stays visible.
 */

import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import type { SafeStorageStatus } from '@/types/ipc';

interface StorageSecurityState {
  /** Null until the first check resolves. */
  status: SafeStorageStatus | null;
  bannerDismissed: boolean;
  /** Ask the main process. Safe to call more than once. */
  check: () => Promise<void>;
  dismissBanner: () => void;
  /** Applied from the persisted layout at startup. */
  hydrateDismissed: (dismissed: boolean) => void;
}

export const useStorageSecurityStore = create<StorageSecurityState>((set) => ({
  status: null,
  bannerDismissed: false,

  check: async () => {
    try {
      const status = await window.sero.safeStorage.status();
      set({ status });
    } catch {
      // A failed check must not imply a problem. Staying null keeps every
      // surface hidden rather than showing a warning we cannot substantiate.
    }
  },

  dismissBanner: () => {
    set({ bannerDismissed: true });
    void persistLayout({ storageWarningDismissed: true });
  },

  hydrateDismissed: (dismissed) => set({ bannerDismissed: dismissed }),
}));

/** True when storage is confirmed insecure. False while unknown. */
export function useStorageIsInsecure(): boolean {
  return useStorageSecurityStore((s) => s.status !== null && !s.status.secure);
}
