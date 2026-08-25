/**
 * Layout state shape — single source of truth.
 *
 * Used by the renderer (persist-layout.ts, app store hydration),
 * the electron main process (layout IPC handlers), and the
 * window.sero.layout API types. Add new persisted keys here.
 */

import type { DashboardLayoutState } from './dashboard';
import type { BrowserBookmark, BrowserTab } from './browser';
import type { BoardLayoutState } from './board';

export interface PersistedWorkspaceExplorerLayout {
  sidebarOpen?: boolean;
  activePanel?: string;
  terminalOpen?: boolean;
  /** Last expanded size of the explorer sidebar as percentage of the editor row. */
  explorerSidebarSizePct?: number;
  /** Last expanded size of the terminal as percentage of the explorer workspace height. */
  terminalSizePct?: number;
}

/** Subset of a BrowserTab that is safe to persist across restarts. */
export interface PersistedBrowserTab {
  id: string;
  /** Workspace the tab belongs to. Omitted = pre-multi-workspace tabs; hydration defaults to 'global'. */
  workspaceId?: string;
  url: string;
  title?: string;
}

/** Bookmarks persist whole (favicons are optional and small). */
export type PersistedBrowserBookmark = BrowserBookmark;

/** How an expanded tool call group renders its detail. */
export type ToolCallLayout = 'rows' | 'rail';

/** Full layout state persisted to ~/.sero-ui/layout.json. */
export interface LayoutState {
  mainSidebarOpen: boolean;
  chatPanelOpen: boolean;
  favouriteApps: string[];
  /** Persisted panel size percentages (0–100). */
  mainSidebarSizePct?: number;
  chatPanelSizePct?: number;
  /** UI theme mode preference ('light' | 'dark' | 'system'). Backward compat: also accepts legacy 'dark'/'light'. */
  theme?: string;
  /** Active theme preset ID. */
  activeThemeId?: string;
  /** Whether the theme editor persists edits as fields change. */
  themeEditorAutoSave?: boolean;
  /** Selected Monaco editor theme ID (defaults to 'auto' which follows the UI mode). */
  editorThemeId?: string;
  /** Expanded tool call layout: inline rows (default) or rail with one detail pane. */
  toolCallLayout?: ToolCallLayout;
  /** Last active workspace ID. */
  activeWorkspaceId?: string | null;
  /** Last active app tab. */
  activeApp?: string;
  /** Last internal view published by each app and workspace scope. */
  appViewIds?: Record<string, Record<string, string>>;
  /** App ids pinned as shortcut chips in the title bar. */
  chromeShortcuts?: string[];
  /** Page zoom factor (chrome bars counter-scale and stay constant). */
  zoomFactor?: number;
  /** Last active session ID. */
  activeSessionId?: string | null;
  /** Favourite model keys ("provider/modelId"). */
  favouriteModels?: string[];
  /**
   * Whether the insecure-credential-storage banner has been dismissed.
   *
   * Dismissing hides the banner only. The status-bar indicator stays, so the
   * condition never becomes invisible.
   */
  storageWarningDismissed?: boolean;
  /** Hidden model keys ("provider/modelId"). */
  hiddenModels?: string[];
  /** Provider IDs entirely hidden from the model selector. */
  hiddenProviders?: string[];
  /** Dashboard widget grid layout. */
  dashboardLayout?: DashboardLayoutState;
  /** Agent Board preferences (collapsed columns, workspace filter). */
  boardLayout?: BoardLayoutState;
  /** Open browser tabs (restored on app start). */
  browserTabs?: PersistedBrowserTab[];
  /** Active browser tab id per workspace. */
  activeBrowserTabIds?: Record<string, string | null>;
  /** Legacy: single active browser tab id (pre-per-workspace). */
  activeBrowserTabId?: string | null;
  /** User-saved bookmarks. */
  browserBookmarks?: PersistedBrowserBookmark[];
  /** Explorer UI state keyed by workspace id. */
  explorerLayout?: Record<string, PersistedWorkspaceExplorerLayout>;
}

// Re-export so callers can import the canonical runtime tab shape
// alongside the persisted shape.
export type { BrowserBookmark, BrowserTab };

/**
 * Shape returned by layout.load() — same fields but favouriteApps
 * is optional (older layout files may not have it).
 */
export interface LoadedLayoutState extends Omit<LayoutState, 'favouriteApps'> {
  favouriteApps?: string[];
}
