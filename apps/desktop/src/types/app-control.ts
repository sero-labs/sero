/**
 * Types for agent app control — navigation, screenshots, interaction, recording.
 *
 * Used by:
 * - electron/ipc/app-control.ts (main process IPC handlers)
 * - electron/cli/commands/app-control.ts (CLI commands)
 * - src/lib/app-control-bridge.ts (renderer bridge)
 */

/** Summary of an available app for the agent. */
export interface AppControlEntry {
  id: string;
  name: string;
  icon: string;
  builtin: boolean;
  scope: 'global' | 'workspace' | null;
  hasUI: boolean;
}

/** Bounding box for an element inside the app panel, in CSS px relative to the panel top-left. */
export interface AppElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Description of an element discovered by app inspection. */
export interface AppElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  role: string | null;
  ariaLabel: string | null;
  title: string | null;
  text: string | null;
  value: string | null;
  rect: AppElementRect;
  interactive: boolean;
  selectorHint: string | null;
}

/** Result of an inspection query against the app panel. */
export interface AppInspectionResult {
  mode: 'point' | 'selector' | 'interactive-list';
  panelRect: AppPanelRect;
  point?: { x: number; y: number } | null;
  selector?: string | null;
  matched?: AppElementInfo | null;
  clickTarget?: AppElementInfo | null;
  stack?: AppElementInfo[];
  interactives?: AppElementInfo[];
}

/** Result of an app interaction command. */
export interface AppInteractionResult {
  success: boolean;
  message: string;
  /** Base64 PNG screenshot taken after the interaction (if requested). */
  screenshot?: string;
  /** Text content extracted from the target element (for get-text). */
  textContent?: string;
  /** DOM inspection output for inspection queries. */
  inspection?: AppInspectionResult;
}

/** Parameters for an app interaction command. */
export interface AppInteractionParams {
  action: 'click' | 'type' | 'scroll' | 'select' | 'get-text' | 'hover' | 'inspect';
  /** CSS selector targeting an element within the app panel. */
  selector?: string;
  /** X coordinate relative to app panel (for positional click). */
  x?: number;
  /** Y coordinate relative to app panel (for positional click). */
  y?: number;
  /** Text to type (for type action). */
  text?: string;
  /** Scroll direction (for scroll action). */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Scroll amount in pixels (default: 300). */
  amount?: number;
  /** Whether to capture a screenshot after the action (default: true). */
  captureAfter?: boolean;
}

/** Bounding rect of the app panel in CSS px relative to the renderer viewport. */
export interface AppPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Recording status info. */
export interface AppRecordingStatus {
  recording: boolean;
  startedAt?: string;
  durationMs?: number;
}

/** Result returned when recording stops. */
export interface AppRecordingResult {
  /** Absolute path to the MP4 file (or frames directory if ffmpeg unavailable). */
  path: string;
  /** True if an actual MP4 was produced, false if fallback frames directory. */
  isVideo: boolean;
  /** Duration of the recording in milliseconds. */
  durationMs: number;
  /** Total number of captured frames. */
  frameCount: number;
}
