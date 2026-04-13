/**
 * Typed access to the `window.sero` preload API.
 *
 * The full SeroAPI lives in apps/desktop/src/types/electron.d.ts. This
 * module declares only the subset app-runtime hooks need, keeping the
 * package decoupled from the desktop app's types while providing type
 * safety for all IPC calls.
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
  promptStream?(
    appId: string,
    workspaceId: string,
    text: string,
    onDelta: (delta: string) => void,
  ): Promise<string>;
}

export interface SeroGitAppActionParams {
  action: string;
  file?: string;
  message?: string;
  branch?: string;
  hash?: string;
  staged?: boolean;
  all?: boolean;
  stashIndex?: number;
}

export interface SeroGitAppActionResult {
  ok: boolean;
  message: string;
}

export interface SeroGitAppBridge {
  run(workspaceId: string, params: SeroGitAppActionParams): Promise<SeroGitAppActionResult>;
}

export interface SeroEditorExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SeroEditorBridge {
  exec(workspaceId: string, command: string): Promise<SeroEditorExecResult>;
}

// ── Model types (subset of desktop's ipc types) ──────────────

/** Serialisable model info for app modules. */
export interface AppModelInfo {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels?: string[];
  supportsXhigh?: boolean;
}

/** A group of models under a single provider. */
export interface AppModelGroup {
  provider: string;
  displayName: string;
  logo: string;
  models: AppModelInfo[];
}

export interface SeroModelsBridge {
  list(): Promise<AppModelGroup[]>;
}

export interface SeroBridge {
  appState: SeroAppStateBridge;
  appAgent: SeroAppAgentBridge;
  gitApp?: SeroGitAppBridge;
  editor?: SeroEditorBridge;
  models?: SeroModelsBridge;
}

function readWindowSero(value: Window): unknown {
  return Reflect.get(value, 'sero');
}

function isSeroBridge(value: unknown): value is SeroBridge {
  return typeof value === 'object'
    && value !== null
    && 'appState' in value
    && 'appAgent' in value;
}

/**
 * Get the Sero preload bridge. Throws if not running inside the Sero shell.
 */
export function getSeroApi(): SeroBridge {
  const sero = readWindowSero(window);
  if (!isSeroBridge(sero)) {
    throw new Error('[app-runtime] window.sero not available — must run inside Sero shell');
  }
  return sero;
}
