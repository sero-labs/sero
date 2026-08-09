import { useDashboardStore } from '@/stores/dashboard';
import { useModelPreferences } from '@/stores/model-preferences';
import { useSessionStore } from '@/stores/sessions';
import { hydrateThemeStore, useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';
import { useBrowserStore } from '@/stores/browser';
import { useExplorerStore } from '@/stores/explorer';
import { useAgentBoardStore } from '@/stores/agent-board';
import { seedNavigationHistory } from '@/stores/navigation';
import { hydrateZoom } from '@/stores/zoom';
import { normaliseChromeShortcuts, normaliseFavouriteApps } from './shared';
import type { AppState } from './state';
import { useAppStore } from './state';

let unsubscribeDashboardBackground: (() => void) | null = null;

/** Load layout state from disk and hydrate all stores. */
export async function loadLayout(): Promise<void> {
  try {
    const dashboardApi = window.sero.dashboard;
    unsubscribeDashboardBackground?.();
    unsubscribeDashboardBackground = dashboardApi?.onBackgroundChanged((backgroundImage) => {
      useDashboardStore.getState().setBackgroundImage(backgroundImage);
    }) ?? null;

    const backgroundPromise = dashboardApi
      ? dashboardApi.getBackground().catch((err: unknown) => {
          console.warn('[app-store] Failed to load dashboard background:', err);
          return null;
        })
      : Promise.resolve(null);
    const [state, backgroundImage] = await Promise.all([
      window.sero.layout.load(),
      backgroundPromise,
    ]);
    useDashboardStore.getState().setBackgroundImage(backgroundImage);
    if (state) {
      const favouriteApps = normaliseFavouriteApps(state.favouriteApps);
      const update: Partial<AppState> & { layoutReady: true } = {
        mainSidebarOpen: state.mainSidebarOpen,
        chatPanelOpen: state.chatPanelOpen,
        favouriteApps,
        chromeShortcuts: normaliseChromeShortcuts(state.chromeShortcuts, favouriteApps),
        layoutReady: true,
      };

      if (typeof state.mainSidebarSizePct === 'number' && state.mainSidebarSizePct > 0) {
        update.mainSidebarSizePct = state.mainSidebarSizePct;
      }
      if (typeof state.chatPanelSizePct === 'number' && state.chatPanelSizePct > 0) {
        update.chatPanelSizePct = state.chatPanelSizePct;
      }
      if (
        typeof state.chatCollaborationSizePct === 'number' &&
        state.chatCollaborationSizePct > 0
      ) {
        update.chatCollaborationSizePct = state.chatCollaborationSizePct;
      }

      // Hydrate theme via theme store (handles presets + mode)
      await hydrateThemeStore(state.theme, state.activeThemeId);
      const effective = useThemeStore.getState().effectiveMode;
      update.theme = effective;

      if (typeof state.editorThemeId === 'string' && state.editorThemeId.length > 0) {
        update.editorThemeId = state.editorThemeId;
      }
      if (typeof state.themeEditorAutoSave === 'boolean') {
        update.themeEditorAutoSave = state.themeEditorAutoSave;
      }

      // Hydrate active app
      if (state.activeApp && typeof state.activeApp === 'string') {
        update.activeApp = state.activeApp;
      }

      useAppStore.setState(update);
      seedNavigationHistory(update.activeApp ?? useAppStore.getState().activeApp);
      hydrateZoom(state.zoomFactor);

      // Hydrate active workspace into workspace store
      if (state.activeWorkspaceId !== undefined) {
        useWorkspaceStore.setState({ activeWorkspaceId: state.activeWorkspaceId ?? null });
      }

      // Hydrate active session into session store
      if (state.activeSessionId !== undefined) {
        useSessionStore.setState({ activeSessionId: state.activeSessionId ?? null });
      }

      // Hydrate dashboard layout
      useDashboardStore.getState().hydrate(state.dashboardLayout);

      // Hydrate model preferences
      useModelPreferences.getState().hydrate({
        favouriteModels: state.favouriteModels,
        hiddenModels: state.hiddenModels,
        hiddenProviders: state.hiddenProviders,
      });

      // Hydrate browser tabs (WebContentsViews are created lazily when the
      // user opens the browser panel, not eagerly here).
      useBrowserStore.getState().hydrate({
        tabs: state.browserTabs,
        activeIds: state.activeBrowserTabIds,
        legacyActiveId: state.activeBrowserTabId ?? null,
        bookmarks: state.browserBookmarks,
      });

      // Hydrate Explorer panel sizes and visibility per workspace.
      useExplorerStore.getState().hydrate(state.explorerLayout);

      // Hydrate Agent Board preferences.
      useAgentBoardStore.getState().hydrate(state.boardLayout);

      return;
    }
  } catch (err) {
    console.warn('[app-store] Failed to load layout:', err);
  }

  useAppStore.setState({ layoutReady: true });
  seedNavigationHistory(useAppStore.getState().activeApp);
}
