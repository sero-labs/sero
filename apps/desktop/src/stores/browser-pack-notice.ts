import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import type { BrowserPackStatusIPC } from '@sero-ai/common';

interface BrowserPackNoticeState {
  notifiedVersion: string | null;
  status: BrowserPackStatusIPC | null;
  visible: boolean;
  hydrate: (notifiedVersion: string | undefined) => void;
  check: () => Promise<void>;
  dismiss: () => void;
}

export const useBrowserPackNoticeStore = create<BrowserPackNoticeState>((set, get) => ({
  notifiedVersion: null,
  status: null,
  visible: false,

  hydrate: (notifiedVersion) => set({ notifiedVersion: notifiedVersion ?? null }),

  check: async () => {
    try {
      const status = await window.sero.workspace.getBrowserPackStatus();
      const isUpdate = status.state === 'installable'
        && typeof status.previousManifestVersion === 'string';
      if (!isUpdate || get().notifiedVersion === status.manifestVersion) {
        set({ status, visible: false });
        return;
      }

      set({
        notifiedVersion: status.manifestVersion,
        status,
        visible: true,
      });
      persistLayout({ browserPackNoticeVersion: status.manifestVersion });
    } catch {
      set({ visible: false });
    }
  },

  dismiss: () => set({ visible: false }),
}));
