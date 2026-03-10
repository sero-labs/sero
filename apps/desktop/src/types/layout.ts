/**
 * Layout state shape — single source of truth.
 *
 * Used by the renderer (persist-layout.ts, app store hydration),
 * the electron main process (layout IPC handlers), and the
 * window.sero.layout API types. Add new persisted keys here.
 */

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
  /** Last active workspace ID. */
  activeWorkspaceId?: string | null;
  /** Last active app tab. */
  activeApp?: string;
  /** Last active session ID. */
  activeSessionId?: string | null;
}

/**
 * Shape returned by layout.load() — same fields but favouriteApps
 * is optional (older layout files may not have it).
 */
export interface LoadedLayoutState extends Omit<LayoutState, 'favouriteApps'> {
  favouriteApps?: string[];
}
