/**
 * Typed access to the `window.sero` preload API.
 *
 * The full SeroAPI lives in apps/desktop/src/types/electron.d.ts. This
 * module declares only the subset app-runtime hooks need, keeping the
 * package decoupled from the desktop app's types while providing type
 * safety for all IPC calls.
 *
 * The single `(window as ...)` cast lives here — every other module
 * imports the typed getter.
 */

export interface SeroAppStateBridge {
  read(filePath: string): Promise<unknown>;
  write(filePath: string, data: unknown): Promise<void>;
  watch(filePath: string): Promise<unknown>;
  unwatch(filePath: string): Promise<void>;
  onChange(cb: (filePath: string, data: unknown) => void): () => void;
}

export interface SeroAppAgentBridge {
  prompt(appId: string, workspaceId: string, text: string): Promise<string>;
}

export interface SeroBridge {
  appState: SeroAppStateBridge;
  appAgent: SeroAppAgentBridge;
}

/**
 * Get the Sero preload bridge. Throws if not running inside the Sero shell.
 */
export function getSeroApi(): SeroBridge {
  const sero = (window as unknown as { sero?: SeroBridge }).sero;
  if (!sero) {
    throw new Error('[app-runtime] window.sero not available — must run inside Sero shell');
  }
  return sero;
}
