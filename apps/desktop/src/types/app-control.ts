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
  ref: string;
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

export interface AppScrollInfo {
  ref: string;
  selectorHint: string | null;
  label: string;
  rect: AppElementRect;
  scrollTop: number;
  scrollLeft: number;
  maxScrollTop: number;
  maxScrollLeft: number;
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollWidth: number;
}

export interface AppAccessibilitySnapshot {
  panelRect: AppPanelRect;
  headings: AppElementInfo[];
  sections: AppElementInfo[];
  buttons: AppElementInfo[];
  links: AppElementInfo[];
  inputs: AppElementInfo[];
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
  /** Structured visible element summary for accessibility snapshot queries. */
  snapshot?: AppAccessibilitySnapshot;
  /** Scroll containers discovered in the app panel. */
  scrollContainers?: AppScrollInfo[];
}

/** Parameters for an app interaction command. */
export interface AppInteractionParams {
  action:
    | 'click'
    | 'type'
    | 'scroll'
    | 'scroll-to'
    | 'select'
    | 'get-text'
    | 'hover'
    | 'inspect'
    | 'visible'
    | 'snapshot'
    | 'scroll-containers';
  /** CSS selector targeting an element within the app panel. */
  selector?: string;
  /** Temporary element ref returned by inspect/snapshot. */
  ref?: string;
  /** X coordinate relative to app panel (for positional click). */
  x?: number;
  /** Y coordinate relative to app panel (for positional click). */
  y?: number;
  /** Text to type (for type action). */
  text?: string;
  /** Text to find for visible/scroll-to/get-text around queries. */
  aroundText?: string;
  /** CSS selector that scopes text search. */
  withinSelector?: string;
  /** Visible container text that scopes text search. */
  containerText?: string;
  /** Horizontal scroll delta in CSS pixels. */
  deltaX?: number;
  /** Vertical scroll delta in CSS pixels. */
  deltaY?: number;
  /** Scroll direction (for scroll action). */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Scroll amount in pixels (default: 300). */
  amount?: number;
  /** Return only text from nodes intersecting the visible viewport. */
  visibleOnly?: boolean;
  /** Return only interactive elements during inspection. */
  interactiveOnly?: boolean;
  /** Maximum number of elements returned by inspection/listing commands. */
  limit?: number;
  /** Whether to capture a screenshot after the action (default: true). */
  captureAfter?: boolean;
}

export interface AppFullScreenshotTarget {
  ref: string;
  label: string;
  rect: AppPanelRect;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  positions: number[];
}

/** Bounding rect of the app panel in CSS px relative to the renderer viewport. */
export interface AppPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for starting a recording. */
export interface AppRecordingOptions {
  /**
   * Capture frame rate in frames per second. Default 2 (a light screencast).
   * Raise for smoother demo footage (~12–15 is smooth for UI motion). The
   * effective rate is capped by how fast the window can be captured.
   */
  fps?: number;
  /**
   * Capture the whole app window (chrome, sidebar, panels) instead of just the
   * active app-panel region. Use for demos of the full product.
   */
  fullWindow?: boolean;
  /**
   * x264 constant-rate-factor quality (0–51, lower = higher quality/larger).
   * Default 23. Use ~18 for near-lossless demo/export quality.
   */
  crf?: number;
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
