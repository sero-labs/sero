/**
 * App context — provided by Sero's shell when mounting a federated app.
 *
 * Uses a globalThis singleton so the SAME context object is shared
 * between host and remote even if @sero/app-runtime is instantiated
 * multiple times (which happens in Vite dev mode with MF).
 */

import { createContext } from 'react';

export interface AppContextValue {
  /** App identifier (e.g. "todo"). */
  appId: string;
  /** Absolute path to the workspace root. */
  workspacePath: string;
  /** Absolute path to the state file on disk. */
  stateFilePath: string;
}

const CONTEXT_KEY = '__sero_app_context__';

// Ensure a single context instance across all module copies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (!g[CONTEXT_KEY]) {
  g[CONTEXT_KEY] = createContext<AppContextValue | null>(null);
}

export const AppContext: React.Context<AppContextValue | null> = g[CONTEXT_KEY];

export const AppProvider = AppContext.Provider;
