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

/** Parsed app-state content plus the etag a later write must echo. */
export interface AppStateReadResult<TData = unknown> {
  data: TData;
  /** Hash of the raw file text; `null` when the file is absent. */
  etag: string | null;
}

/**
 * Result of an app-state write. `ok: false` means the caller's etag no longer
 * matches the file: nothing was written, and `data`/`etag` carry the current
 * content so the caller can re-apply its change on top.
 */
export type AppStateWriteResult =
  | { ok: true; etag: string }
  | { ok: false; data: unknown; etag: string | null };

export interface SeroWindowAppStateBridge {
  read<TData = unknown>(filePath: string): Promise<TData>;
  write<TData = unknown>(filePath: string, data: TData, expectedEtag?: string | null): Promise<AppStateWriteResult>;
  watch<TData = unknown>(filePath: string): Promise<AppStateReadResult<TData>>;
  unwatch(filePath: string): Promise<void>;
  onChange<TData = unknown>(cb: (filePath: string, data: TData, etag: string | null) => void): () => void;
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
  /** Open an app, optionally in a registered workspace. False if either is unknown. */
  open(appId: string, workspaceId?: string): Promise<boolean>;
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

/**
 * A running agent, as a plugin view needs it.
 * A structural subset of the desktop `SubagentEntry`, so the two fit without
 * this package depending on the desktop app's types.
 */
export interface SubagentLiveEntry {
  id: string;
  agentName: string;
  status: string;
  /** The session that started this agent — what a view matches its own work against. */
  parentSessionId: string;
  startedAt: number;
  liveOutput: string;
  toolActivity: Array<{ toolName: string; argsSummary: string; running: boolean }>;
}

/** One subagent event, as a view needs it. */
export interface SubagentLiveEvent {
  type: string;
  id?: string;
  text?: string;
  activity?: Array<{ toolName: string; argsSummary: string; running: boolean }>;
  /** Present on `subagent_start`, so a view can add the run without re-reading. */
  entry?: SubagentLiveEntry;
}

export interface SeroSubagentBridge {
  /** Every run this workspace knows about, for matching by parent session. */
  snapshot(workspaceId: string): Promise<SubagentLiveEntry[]>;
  /** Show this window a run's live text and tool activity. */
  watch(runId: string): Promise<void>;
  /** Release one watch for a run. */
  unwatch(runId: string): Promise<void>;
  /** Subscribe to the subagent event stream. Returns the unsubscribe function. */
  onEvent(callback: (event: SubagentLiveEvent) => void): () => void;
}

/**
 * A runtime-to-UI event, scoped to one app in one workspace.
 * Mirrors `AppRuntimeEvent` in the desktop IPC types.
 */
export interface AppRuntimeUiEvent<T = unknown> {
  appId: string;
  workspaceId: string;
  topic: string;
  payload: T;
}

export interface SeroAppRuntimeUiBridge {
  /** Subscribe to this app's runtime events. Returns the unsubscribe function. */
  onEvent(callback: (event: AppRuntimeUiEvent) => void): () => void;
  subscribe(appId: string, workspaceId: string, topic: string): Promise<void>;
  unsubscribe(appId: string, workspaceId: string, topic: string): Promise<void>;
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
  appRuntime?: SeroAppRuntimeUiBridge;
  /** Present on hosts that can report live subagent runs. */
  subagent?: SeroSubagentBridge;
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
  // The full `window.sero` type belongs to the Sero shell, not this package.
  const shell = globalThis as { sero?: unknown };
  const sero = shell.sero;
  if (!isSeroBridge(sero)) {
    throw new Error('[app-runtime] window.sero not available — must run inside Sero shell');
  }
  return sero;
}
