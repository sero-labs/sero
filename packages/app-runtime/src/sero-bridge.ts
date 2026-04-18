/**
 * Typed access to the `window.sero` preload API.
 *
 * The full SeroAPI lives in apps/desktop/src/types/electron.d.ts. This
 * module declares only the subset app-runtime hooks need, keeping the
 * package decoupled from the desktop app's types while providing type
 * safety for all IPC calls.
 */

import type {
  AppToolResult,
  GitActionResult,
  GitManagerRequest,
  SharedAvailableModelGroup,
  SharedModelInfo,
  WebAppActionResult,
  WebAppRequest,
} from '@sero/common';

export interface SeroWindowAppStateBridge {
  read<TData = unknown>(filePath: string): Promise<TData>;
  write<TData = unknown>(filePath: string, data: TData): Promise<void>;
  watch<TData = unknown>(filePath: string): Promise<TData>;
  unwatch(filePath: string): Promise<void>;
  onChange<TData = unknown>(cb: (filePath: string, data: TData) => void): () => void;
}

export interface SeroAppAgentBridge {
  prompt(appId: string, workspaceId: string, text: string): Promise<string>;
  promptStream?(
    appId: string,
    workspaceId: string,
    text: string,
    onDelta: (delta: string) => void,
  ): Promise<string>;
  invokeTool?(
    appId: string,
    workspaceId: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<AppToolResult>;
}

export interface SeroGitAppBridge {
  run(workspaceId: string, params: GitManagerRequest): Promise<GitActionResult>;
}

export interface SeroWebAppBridge {
  run(workspaceId: string, params: WebAppRequest): Promise<WebAppActionResult>;
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
export type AppModelInfo = SharedModelInfo;

/** A group of models under a single provider. */
export type AppModelGroup = SharedAvailableModelGroup<AppModelInfo>;

export interface SeroModelsBridge {
  list(): Promise<AppModelGroup[]>;
}

export interface SeroBridge {
  appState: SeroWindowAppStateBridge;
  appAgent: SeroAppAgentBridge;
  gitApp?: SeroGitAppBridge;
  webApp?: SeroWebAppBridge;
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
