/**
 * Shared types for the application chrome (title bar, status bar, window
 * frame). Used by the renderer stores/components and the preload bridge.
 */

/** Zoom command sent from the application menu (View → Zoom In/Out/Reset). */
export type ZoomCommand = 'in' | 'out' | 'reset';

/** Renderer-facing window API exposed as `window.sero.window`. */
export interface SeroWindowAPI {
  /** Minimize the window (Linux custom window controls). */
  minimize(): Promise<void>;
  /** Toggle maximize/restore (Linux custom window controls). */
  toggleMaximize(): Promise<void>;
  /** Close the window (Linux custom window controls). */
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Subscribe to maximize/restore transitions. Returns unsubscribe. */
  onMaximizedChanged(callback: (maximized: boolean) => void): () => void;
  /** Re-sync the Windows title-bar overlay colors after a theme change. */
  setOverlayColors(colors: { color: string; symbolColor: string }): Promise<void>;
  /** Subscribe to zoom commands from the application menu. Returns unsubscribe. */
  onZoomCommand(callback: (command: ZoomCommand) => void): () => void;
  /** Apply a page zoom factor via webFrame. */
  setZoomFactor(factor: number): void;
  getZoomFactor(): number;
}
