import { useDashboardStore } from '@/stores/dashboard';
import { useModelPreferences } from '@/stores/model-preferences';
import { useSessionStore } from '@/stores/sessions';
import { hydrateThemeStore, useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';
import { normaliseFavouriteApps } from './shared';
import type { AppState } from './state';
import { useAppStore } from './state';

/** Load layout state from disk and hydrate all stores. */
export async function loadLayout(): Promise<void> {
  try {
    const state = await window.sero.layout.load();
    if (state) {
      const update: Partial<AppState> & { layoutReady: true } = {
        mainSidebarOpen: state.mainSidebarOpen,
        chatPanelOpen: state.chatPanelOpen,
        favouriteApps: normaliseFavouriteApps(state.favouriteApps),
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

      // Hydrate active app
      if (state.activeApp && typeof state.activeApp === 'string') {
        update.activeApp = state.activeApp;
      }

      useAppStore.setState(update);

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

      return;
    }
  } catch (err) {
    console.warn('[app-store] Failed to load layout:', err);
  }

  useAppStore.setState({ layoutReady: true });
}
