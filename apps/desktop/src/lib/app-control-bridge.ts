/**
 * Renderer-side bridge for app control.
 *
 * Exposes `window.__appControl` — a set of functions that the main process
 * calls via `webContents.executeJavaScript()`. Reads/writes the Zustand
 * app store and delegates DOM operations to renderer-side helpers.
 */

import { useAppStore } from '@/stores/app';
import { useBrowserStore } from '@/stores/browser';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';
import { openApp } from '@/lib/open-app';
import { executeAppInteraction, getAppPanelRect } from '@/lib/app-control/dom-interactions';
import {
  prepareFullScreenshot,
  restoreFullScreenshotScroll as restoreFullScreenshotElementScroll,
  setFullScreenshotScroll as setFullScreenshotElementScroll,
  stitchFullScreenshot,
  type ScreenshotPiece,
} from '@/lib/app-control/dom/full-screenshot';
import type {
  AppControlEntry,
  AppFullScreenshotTarget,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
} from '@/types/ipc';

// ── Recording State ──────────────────────────────────────────

const RECORDING_CURSOR_SVG = `
  <svg viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2 1v20l5-5 4 11 4-2-4-11h7L2 1Z" fill="white" stroke="black" stroke-width="2" stroke-linejoin="round" />
  </svg>
`;

const CLICK_HIGHLIGHT_DURATION_MS = 700;

let recordingActive = false;
let recordingClickHighlights = new Set<HTMLDivElement>();
let recordingCursor: HTMLDivElement | null = null;
let recordingStartedAt: string | null = null;

function removeRecordingCursor(): void {
  window.removeEventListener('mousemove', moveRecordingCursor);
  recordingCursor?.remove();
  recordingCursor = null;
}

function removeRecordingClickHighlights(): void {
  window.removeEventListener('pointerdown', showRecordingClickHighlight);
  for (const highlight of recordingClickHighlights) highlight.remove();
  recordingClickHighlights = new Set();
}

function showRecordingClickHighlight(event: PointerEvent): void {
  const highlight = document.createElement('div');
  const core = document.createElement('span');
  highlight.dataset.seroRecordingClick = '';
  highlight.setAttribute('aria-hidden', 'true');
  highlight.style.cssText = [
    'position: fixed',
    `left: ${event.clientX}px`,
    `top: ${event.clientY}px`,
    'width: 40px',
    'height: 40px',
    'border: 2px solid #71b9ff',
    'border-radius: 9999px',
    'box-shadow: 0 0 20px rgb(113 185 255 / 0.5)',
    'pointer-events: none',
    'transform: translate(-50%, -50%)',
    'z-index: 2147483647',
  ].join(';');
  core.style.cssText = [
    'position: absolute',
    'top: 50%',
    'left: 50%',
    'width: 8px',
    'height: 8px',
    'border-radius: 50%',
    'background: #d8efff',
    'box-shadow: 0 0 14px #71b9ff',
    'transform: translate(-50%, -50%)',
  ].join(';');
  highlight.appendChild(core);
  document.body.appendChild(highlight);
  recordingClickHighlights.add(highlight);
  highlight.animate?.(
    [
      { opacity: 1, transform: 'translate(-50%, -50%) scale(0.22)' },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(1.85)' },
    ],
    { duration: CLICK_HIGHLIGHT_DURATION_MS, easing: 'cubic-bezier(.1,.75,.35,1)' },
  );
  core.animate?.(
    [
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(0.2)' },
    ],
    { duration: CLICK_HIGHLIGHT_DURATION_MS, easing: 'ease-out' },
  );
  window.setTimeout(() => {
    highlight.remove();
    recordingClickHighlights.delete(highlight);
  }, CLICK_HIGHLIGHT_DURATION_MS);
}

function addRecordingClickHighlights(): void {
  removeRecordingClickHighlights();
  window.addEventListener('pointerdown', showRecordingClickHighlight);
}

function moveRecordingCursor(event: MouseEvent): void {
  if (!recordingCursor) return;
  recordingCursor.style.display = 'block';
  recordingCursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
}

function addRecordingCursor(initialRect: AppPanelRect): void {
  removeRecordingCursor();
  recordingCursor = document.createElement('div');
  recordingCursor.dataset.seroRecordingCursor = '';
  recordingCursor.setAttribute('aria-hidden', 'true');
  recordingCursor.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 20px',
    'height: 28px',
    'display: block',
    'pointer-events: none',
    'z-index: 2147483647',
  ].join(';');
  recordingCursor.style.transform = `translate(${initialRect.x + initialRect.width / 2}px, ${initialRect.y + initialRect.height / 2}px)`;
  recordingCursor.innerHTML = RECORDING_CURSOR_SVG;
  document.body.appendChild(recordingCursor);
  window.addEventListener('mousemove', moveRecordingCursor);
}


// ── Bridge Interface ─────────────────────────────────────────

interface AppControlBridge {
  getList(): AppControlEntry[];
  getActive(): string;
  openApp(appId: string): boolean;
  getInfo(appId: string): AppControlEntry | null;
  openFile(workspaceId: string, filePath: string): boolean;
  showBrowserPanel(): boolean;
  getAppRect(): AppPanelRect | null;
  getBrowserCaptureTarget(): { workspaceId: string; tabId: string; rect: AppPanelRect } | null;
  interact(params: AppInteractionParams): Promise<AppInteractionResult>;
  prepareFullScreenshot(selector?: string): AppFullScreenshotTarget | null;
  setFullScreenshotScroll(ref: string, scrollTop: number): boolean;
  restoreFullScreenshotScroll(ref: string, scrollTop: number, scrollLeft: number): boolean;
  stitchFullScreenshot(target: AppFullScreenshotTarget, pieces: ScreenshotPiece[]): Promise<string>;
  recordStart(): boolean;
  recordStop(): boolean;
  getRecordingStatus(): AppRecordingStatus;
  /** Open a dev server URL as an in-app preview tab. */
  openDevPreview(url: string): boolean;
}

declare global {
  interface Window {
    __appControl?: AppControlBridge;
  }
}

function toAppControlEntry(app: {
  id: string;
  label: string;
  icon: string;
  builtin: boolean;
  manifest: { scope?: string; component?: string | null } | null;
}): AppControlEntry {
  return {
    id: app.id,
    name: app.label,
    icon: app.icon,
    builtin: app.builtin,
    scope: (app.manifest?.scope as 'global' | 'workspace') ?? null,
    hasUI: app.builtin || !!app.manifest?.component,
  };
}

/**
 * Initialize the `window.__appControl` bridge.
 * Call once from App.tsx useEffect. Returns cleanup function.
 */
export function initAppControlBridge(): () => void {
  window.__appControl = {
    getList: () => useAppStore.getState().apps.map(toAppControlEntry),
    getActive: () => useAppStore.getState().activeApp,
    openApp(appId) {
      const state = useAppStore.getState();
      if (!state.apps.some((app) => app.id === appId)) return false;
      openApp(appId);
      return true;
    },
    getInfo(appId) {
      const app = useAppStore.getState().apps.find((entry) => entry.id === appId);
      return app ? toAppControlEntry(app) : null;
    },
    openFile(workspaceId: string, filePath: string) {
      const state = useAppStore.getState();
      if (state.activeApp !== 'explorer') state.setActiveApp('explorer');
      useEditorBridge.getState().requestOpenFile(workspaceId, filePath);
      return true;
    },
    showBrowserPanel() {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      if (!workspaceId) return false;
      const state = useAppStore.getState();
      if (state.activeApp !== 'explorer') state.setActiveApp('explorer');
      useExplorerStore.getState().set(workspaceId, { activePanel: 'browser', sidebarOpen: false });
      return true;
    },
    getAppRect: getAppPanelRect,
    getBrowserCaptureTarget() {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      if (!workspaceId || useAppStore.getState().activeApp !== 'explorer') return null;
      if (useExplorerStore.getState().get(workspaceId).activePanel !== 'browser') return null;
      const tabId = useBrowserStore.getState().activeTabIds[workspaceId];
      const rect = getAppPanelRect();
      return tabId && rect ? { workspaceId, tabId, rect } : null;
    },
    interact: executeAppInteraction,
    prepareFullScreenshot(selector?: string) {
      const panel = document.querySelector('[data-app-panel]');
      return panel instanceof HTMLElement ? prepareFullScreenshot(panel, selector) : null;
    },
    setFullScreenshotScroll(ref: string, scrollTop: number) {
      const panel = document.querySelector('[data-app-panel]');
      return panel instanceof HTMLElement && setFullScreenshotElementScroll(panel, ref, scrollTop);
    },
    restoreFullScreenshotScroll(ref: string, scrollTop: number, scrollLeft: number) {
      const panel = document.querySelector('[data-app-panel]');
      return panel instanceof HTMLElement && restoreFullScreenshotElementScroll(panel, ref, scrollTop, scrollLeft);
    },
    stitchFullScreenshot,
    recordStart() {
      if (recordingActive) return false;
      const appPanelRect = getAppPanelRect();
      if (!appPanelRect) return false;
      addRecordingCursor(appPanelRect);
      addRecordingClickHighlights();
      recordingActive = true;
      recordingStartedAt = new Date().toISOString();
      return true;
    },
    recordStop() {
      if (!recordingActive) return false;
      removeRecordingCursor();
      removeRecordingClickHighlights();
      recordingActive = false;
      recordingStartedAt = null;
      return true;
    },
    getRecordingStatus() {
      if (!recordingActive) return { recording: false };
      return {
        recording: true,
        startedAt: recordingStartedAt ?? undefined,
        durationMs: recordingStartedAt
          ? Date.now() - new Date(recordingStartedAt).getTime()
          : undefined,
      };
    },
    openDevPreview(url: string) {
      const state = useAppStore.getState();
      if (state.activeApp !== 'explorer') state.setActiveApp('explorer');
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
      useEditorBridge.getState().requestOpenFile(workspaceId, `devserver://${url}`);
      return true;
    },
  };

  return () => {
    removeRecordingCursor();
    removeRecordingClickHighlights();
    delete window.__appControl;
  };
}
