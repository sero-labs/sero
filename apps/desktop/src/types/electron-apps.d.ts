/**
 * App-specific `window.sero` interfaces.
 *
 * Split from electron.d.ts to keep declaration files under 500 LOC.
 */

import type {
  AppStateReadResult,
  AppStateWriteResult,
  SeroAppManifest,
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingResult,
  AppRecordingStatus,
} from './ipc';
import type {
  AppToolResult,
  WebAppActionResult,
  WebAppRequest,
} from '@sero-ai/common';

interface SeroAppStateAPI {
  /** Read an app state JSON file. */
  read(filePath: string): Promise<unknown>;
  /** Read a file as raw UTF-8 text (no JSON parsing). Returns null if missing. */
  readText(filePath: string): Promise<string | null>;
  /**
   * Write an app state JSON file (atomic, serialised, cross-process locked).
   * Pass the etag the caller's state is based on to reject stale writes;
   * omit it only for whole-file owners that never hold state between reads.
   */
  write(filePath: string, data: unknown, expectedEtag?: string | null): Promise<AppStateWriteResult>;
  /** Delete an app state / data file. */
  remove(filePath: string): Promise<void>;
  /** Start watching a state file. Returns current state plus its etag. */
  watch(filePath: string): Promise<AppStateReadResult>;
  /** Stop watching a state file. */
  unwatch(filePath: string): Promise<void>;
  /** Subscribe to state file change events. Returns unsubscribe. */
  onChange(callback: (filePath: string, data: unknown, etag: string | null) => void): () => void;
}

interface SeroAppsAPI {
  /** Discover all registered Sero apps from installed Pi packages. */
  discover(): Promise<SeroAppManifest[]>;
  /** Subscribe to new app detection events. Returns unsubscribe function. */
  onNewAppDetected(callback: (appName: string) => void): () => void;
}

interface SeroAppAgentAPI {
  /**
   * Send a prompt to an app's dedicated agent session.
   * Returns the full text response. No active chat session required.
   */
  prompt(appId: string, workspaceId: string, text: string): Promise<string>;

  /**
   * Send a prompt and stream text deltas back via callback.
   * Returns the final accumulated text when complete.
   */
  promptStream(
    appId: string,
    workspaceId: string,
    text: string,
    onDelta: (delta: string) => void,
  ): Promise<string>;

  /**
   * Execute an app-local extension tool directly against the app's isolated session.
   * Returns normalized tool output blocks plus flattened text/details metadata.
   */
  invokeTool(
    appId: string,
    workspaceId: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<AppToolResult>;
}

interface SeroWebAppAPI {
  run(workspaceId: string, params: WebAppRequest): Promise<WebAppActionResult>;
}

interface SeroAppControlAPI {
  /** List all available apps (built-in + discovered). */
  list(): Promise<AppControlEntry[]>;
  /** Get the currently active app ID. */
  active(): Promise<string>;
  /** Switch to a specific app by ID. Returns true if successful. */
  open(appId: string): Promise<boolean>;
  /** Get detailed info for a specific app. */
  info(appId: string): Promise<AppControlEntry | null>;
  /** Open a workspace file in the explorer editor / preview pane. */
  openFile(workspaceId: string, filePath: string): Promise<boolean>;
  /** Capture a screenshot of the app panel. Returns base64 PNG or null. */
  screenshot(): Promise<string | null>;
  /** Capture a window-relative CSS rectangle inside the active app panel. */
  captureRegion(rect: AppPanelRect): Promise<string | null>;
  /** Execute a DOM interaction in the app panel. */
  interact(params: AppInteractionParams): Promise<AppInteractionResult>;
  /** Get the app panel's bounding rect for screenshot targeting. */
  getAppRect(): Promise<AppPanelRect | null>;
  /** Start recording the app panel. */
  recordStart(): Promise<boolean>;
  /** Stop recording. Returns result with MP4 path or null. */
  recordStop(): Promise<AppRecordingResult | null>;
  /** Get current recording status. */
  recordStatus(): Promise<AppRecordingStatus>;
}

export {};
