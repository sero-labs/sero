/**
 * Shared layout persistence — reads current state from all stores and
 * saves to disk via IPC. Also houses `loadLayout()` for hydrating all
 * stores on startup.
 *
 * This module imports every store that contributes layout state. The
 * stores in turn import `persistLayout` from here, creating a circular
 * module graph. This is safe because:
 *   1. Zustand stores are created synchronously at import time — no
 *      deferred `export default`.
 *   2. `persistLayout` only calls `.getState()` at *runtime*, never
 *      during module evaluation.
 *   3. `loadLayout` is called once on startup, long after all modules
 *      have been evaluated.
 */

import type { LayoutState } from '@/types/layout';
import { createDebouncedFn } from '@/hooks/useDebouncedCallback';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';

// Re-export the canonical type so callers don't need a second import.
export type { LayoutState };

/** Build full layout state, merging a partial update with current store values. */
function buildLayoutState(partial: Partial<LayoutState>): LayoutState {
  const app = useAppStore.getState();
  const ws = useWorkspaceStore.getState();
  const sess = useSessionStore.getState();
  return {
    mainSidebarOpen: partial.mainSidebarOpen ?? app.mainSidebarOpen,
    chatPanelOpen: partial.chatPanelOpen ?? app.chatPanelOpen,
    favouriteApps: partial.favouriteApps ?? app.favouriteApps,
    mainSidebarSizePct: partial.mainSidebarSizePct ?? app.mainSidebarSizePct,
    chatPanelSizePct: partial.chatPanelSizePct ?? app.chatPanelSizePct,
    theme: partial.theme ?? app.theme,
    activeWorkspaceId: partial.activeWorkspaceId !== undefined
      ? partial.activeWorkspaceId
      : ws.activeWorkspaceId,
    activeApp: partial.activeApp ?? app.activeApp,
    activeSessionId: partial.activeSessionId !== undefined
      ? partial.activeSessionId
      : sess.activeSessionId,
  };
}

/** Flush layout state to disk (un-debounced). */
function flushLayout(partial: Partial<LayoutState>): void {
  const state = buildLayoutState(partial);
  window.sero.layout.save(state).catch((err) => {
    console.warn('[persist-layout] Failed to persist layout:', err);
  });
}

/**
 * Debounced (80 ms) fire-and-forget save of full layout state to disk.
 * Rapid calls (e.g. panel resize drag, quick toggles) are coalesced
 * into a single write.
 */
export const persistLayout: (partial: Partial<LayoutState>) => void =
  createDebouncedFn(flushLayout, 80);
