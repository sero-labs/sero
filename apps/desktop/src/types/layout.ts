/**
 * Layout state shape — single source of truth.
 *
 * Used by the renderer (persist-layout.ts, app store hydration),
 * the electron main process (layout IPC handlers), and the
 * window.sero.layout API types. Add new persisted keys here.
 */

import type { DashboardLayoutState } from './dashboard';
import type { BrowserTab } from './browser';

/** Subset of a BrowserTab that is safe to persist across restarts. */
export interface PersistedBrowserTab {
  id: string;
  url: string;
  title?: string;
}

/** Full layout state persisted to ~/.sero-ui/layout.json. */
export interface LayoutState {
  mainSidebarOpen: boolean;
  chatPanelOpen: boolean;
  favouriteApps: string[];
  /** Persisted panel size percentages (0–100). */
  mainSidebarSizePct?: number;
  chatPanelSizePct?: number;
  chatCollaborationSizePct?: number;
  /** UI theme mode preference ('light' | 'dark' | 'system'). Backward compat: also accepts legacy 'dark'/'light'. */
  theme?: string;
  /** Active theme preset ID. */
  activeThemeId?: string;
  /** Last active workspace ID. */
  activeWorkspaceId?: string | null;
  /** Last active app tab. */
  activeApp?: string;
  /** Last active session ID. */
  activeSessionId?: string | null;
  /** Favourite model keys ("provider/modelId"). */
  favouriteModels?: string[];
  /** Hidden model keys ("provider/modelId"). */
  hiddenModels?: string[];
  /** Provider IDs entirely hidden from the model selector. */
  hiddenProviders?: string[];
  /** Dashboard widget grid layout. */
  dashboardLayout?: DashboardLayoutState;
  /** Open browser tabs (restored on app start). */
  browserTabs?: PersistedBrowserTab[];
  /** Active browser tab id. */
  activeBrowserTabId?: string | null;
}

// Re-export so callers can import the canonical runtime tab shape
// alongside the persisted shape.
export type { BrowserTab };

/**
 * Shape returned by layout.load() — same fields but favouriteApps
 * is optional (older layout files may not have it).
 */
export interface LoadedLayoutState extends Omit<LayoutState, 'favouriteApps'> {
  favouriteApps?: string[];
}
