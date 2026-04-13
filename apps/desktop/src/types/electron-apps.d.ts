/**
 * App-specific `window.sero` interfaces.
 *
 * Split from electron.d.ts to keep declaration files under 500 LOC.
 */

import type {
  SeroAppManifest,
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingResult,
  AppRecordingStatus,
} from './ipc';
import type { GitActionResult, GitManagerRequest } from '@sero/common';

interface SeroAppStateAPI {
  /** Read an app state JSON file. */
  read(filePath: string): Promise<unknown>;
  /** Read a file as raw UTF-8 text (no JSON parsing). Returns null if missing. */
  readText(filePath: string): Promise<string | null>;
  /** Write an app state JSON file (atomic + serialised). */
  write(filePath: string, data: unknown): Promise<void>;
  /** Delete an app state / data file. */
  remove(filePath: string): Promise<void>;
  /** Start watching a state file. Returns current state. */
  watch(filePath: string): Promise<unknown>;
  /** Stop watching a state file. */
  unwatch(filePath: string): Promise<void>;
  /** Subscribe to state file change events. Returns unsubscribe. */
  onChange(callback: (filePath: string, data: unknown) => void): () => void;
}

interface SeroAppsAPI {
  /** Discover all registered Sero apps from installed Pi packages. */
  discover(): Promise<SeroAppManifest[]>;
  /** Subscribe to new app detection events. Returns unsubscribe function. */
  onNewAppDetected(callback: (appName: string) => void): () => void;
}

interface GogExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  email?: string;
}

interface GoogleAuthEvent {
  type: 'browser' | 'waiting' | 'success' | 'error';
  message: string;
  email?: string;
}

interface SeroGoogleAPI {
  /** Execute a gogcli data command: gog --json --no-input <service> <args>. */
  execute(service: string, subArgs: string[]): Promise<GogExecResult>;
  /** Get current auth status. */
  authStatus(): Promise<GoogleAuthStatus>;
  /** Start OAuth2 sign-in (opens browser). Resolves when complete. */
  login(): Promise<void>;
  /** Sign out. */
  logout(): Promise<void>;
  /** Subscribe to auth flow progress events. Returns unsubscribe. */
  onAuthEvent(callback: (event: GoogleAuthEvent) => void): () => void;
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
}

interface SeroGitAppAPI {
  run(workspaceId: string, params: GitManagerRequest): Promise<GitActionResult>;
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
