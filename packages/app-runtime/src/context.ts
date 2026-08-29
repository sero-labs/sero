/**
 * App context — provided by Sero's shell when mounting a federated app.
 *
 * Uses a globalThis singleton so the SAME context object is shared
 * between host and remote even if @sero-ai/app-runtime is instantiated
 * multiple times (which happens in Vite dev mode with MF).
 */

import { createContext, type Context } from 'react';

export type AppProfilePreferenceValue = string | number | boolean | null;

/** Profile-wide preferences for one app, persisted by the host. */
export interface AppProfilePreferencesValue {
  values: Readonly<Record<string, AppProfilePreferenceValue>>;
  set: (key: string, value: AppProfilePreferenceValue) => void;
}

export interface AppContextValue {
  /** App identifier (e.g. "todo"). */
  appId: string;
  /** Workspace identifier (e.g. "global"). */
  workspaceId: string;
  /** Absolute path to the workspace root. */
  workspacePath: string;
  /** Absolute path to the state file on disk. */
  stateFilePath: string;
  /**
   * Send a prompt to the active agent session.
   * Injected by the shell — apps don't need to know about session IDs.
   * Returns undefined if no session is active.
   */
  promptAgent?: (text: string) => void;
  /** Current effective theme mode ('light' or 'dark'). */
  themeMode?: 'light' | 'dark';
  /** Active theme preset ID. */
  themePresetId?: string;
  /**
   * Active editor/diff theme ID (`'auto'` follows `themeMode`). Plugins that
   * render code or diffs use it so their syntax colours match the host editor.
   */
  editorThemeId?: string;
  /** Browser-style navigation supplied by the host for full app surfaces. */
  navigation?: AppNavigationValue;
  /** Preferences shared by this app across every workspace in the profile. */
  profilePreferences?: AppProfilePreferencesValue;
}

export interface AppNavigationValue {
  /** The sub-view selected by the current host history entry. */
  viewId?: string;
  /** Record a user navigation to another sub-view of this app. */
  navigate: (viewId: string, options?: { replace?: boolean }) => void;
}

declare global {
  var __sero_app_context__: Context<AppContextValue | null> | undefined;
}

const appContext = globalThis.__sero_app_context__
  ?? createContext<AppContextValue | null>(null);

globalThis.__sero_app_context__ = appContext;

export const AppContext: Context<AppContextValue | null> = appContext;

export const AppProvider = AppContext.Provider;
