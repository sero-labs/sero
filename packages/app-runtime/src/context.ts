/**
 * App context — provided by Sero's shell when mounting a federated app.
 *
 * Uses a globalThis singleton so the SAME context object is shared
 * between host and remote even if @sero-ai/app-runtime is instantiated
 * multiple times (which happens in Vite dev mode with MF).
 */

import { createContext, type Context } from 'react';

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
}

declare global {
  var __sero_app_context__: Context<AppContextValue | null> | undefined;
}

const appContext = globalThis.__sero_app_context__
  ?? createContext<AppContextValue | null>(null);

globalThis.__sero_app_context__ = appContext;

export const AppContext: Context<AppContextValue | null> = appContext;

export const AppProvider = AppContext.Provider;
