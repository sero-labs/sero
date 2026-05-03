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
import { useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useModelPreferences } from '@/stores/model-preferences';
import { useDashboardStore } from '@/stores/dashboard';
import { useBrowserStore } from '@/stores/browser';
import { useExplorerStore } from '@/stores/explorer';

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
    chatCollaborationSizePct:
      partial.chatCollaborationSizePct ?? app.chatCollaborationSizePct,
    theme: partial.theme ?? app.theme,
    activeThemeId: partial.activeThemeId ?? useThemeStore.getState().activePresetId,
    editorThemeId: partial.editorThemeId ?? app.editorThemeId,
    activeWorkspaceId: partial.activeWorkspaceId !== undefined
      ? partial.activeWorkspaceId
      : ws.activeWorkspaceId,
    activeApp: partial.activeApp ?? app.activeApp,
    activeSessionId: partial.activeSessionId !== undefined
      ? partial.activeSessionId
      : sess.activeSessionId,
    favouriteModels: partial.favouriteModels ?? useModelPreferences.getState().favouriteModels,
    hiddenModels: partial.hiddenModels ?? useModelPreferences.getState().hiddenModels,
    hiddenProviders: partial.hiddenProviders ?? useModelPreferences.getState().hiddenProviders,
    dashboardLayout: partial.dashboardLayout ?? {
      widgets: useDashboardStore.getState().widgets,
      layouts: useDashboardStore.getState().layouts,
    },
    browserTabs: partial.browserTabs ?? useBrowserStore.getState().tabs.map((t) => ({
      id: t.id,
      workspaceId: t.workspaceId,
      url: t.url,
      title: t.title,
    })),
    activeBrowserTabIds:
      partial.activeBrowserTabIds ?? useBrowserStore.getState().activeTabIds,
    browserBookmarks: partial.browserBookmarks ?? useBrowserStore.getState().bookmarks,
    explorerLayout: partial.explorerLayout ?? useExplorerStore.getState().ui,
  };
}

/** Flush layout state to disk (un-debounced). */
function flushLayout(partial: Partial<LayoutState>): void {
  const seroLayout = globalThis.window?.sero?.layout;
  if (!seroLayout) return;

  const state = buildLayoutState(partial);
  seroLayout.save(state).catch((err) => {
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
