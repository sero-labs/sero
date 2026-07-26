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
  AvailableContext,
  ContextPreset,
  SharedAvailableModelGroup,
  SharedModelInfo,
  WebAppActionResult,
  WebAppRequest,
} from '@sero-ai/common';

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

export interface SeroAppControlBridge {
  /** Switch the shell to the app with this id. False when the app is unknown. */
  open(appId: string): Promise<boolean>;
  /** Open a workspace file in the explorer editor. False when unavailable. */
  openFile(workspaceId: string, filePath: string): Promise<boolean>;
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

export interface SeroSubagentContextBridge {
  /** Available context (tools + skills) for a workspace's background subagents, no session. */
  get(workspaceId: string): Promise<AvailableContext>;
}

export interface SeroContextPresetsBridge {
  /** Load profile-level context presets. */
  load(): Promise<ContextPreset[]>;
  /** Persist the full preset list. */
  save(presets: ContextPreset[]): Promise<void>;
}

export interface SeroBridge {
  appState: SeroWindowAppStateBridge;
  appAgent: SeroAppAgentBridge;
  appControl?: SeroAppControlBridge;
  webApp?: SeroWebAppBridge;
  editor?: SeroEditorBridge;
  models?: SeroModelsBridge;
  subagentContext?: SeroSubagentContextBridge;
  contextPresets?: SeroContextPresetsBridge;
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
