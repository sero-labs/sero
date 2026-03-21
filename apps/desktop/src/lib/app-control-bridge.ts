/**
 * Renderer-side bridge for app control.
 *
 * Exposes `window.__appControl` — a set of functions that the main process
 * calls via `webContents.executeJavaScript()`. Reads/writes the Zustand
 * app store and performs DOM operations in the app panel.
 */

import { useAppStore } from '@/stores/app';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useWorkspaceStore } from '@/stores/workspace';
import { openApp } from '@/lib/open-app';
import type {
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
} from '@/types/ipc';

// ── Constants ────────────────────────────────────────────────

const APP_PANEL_SELECTOR = '[data-app-panel]';

// ── DOM Helpers ──────────────────────────────────────────────

function getAppPanel(): HTMLElement | null {
  return document.querySelector(APP_PANEL_SELECTOR);
}

function findInPanel(selector: string): Element | null {
  return getAppPanel()?.querySelector(selector) ?? null;
}

// ── Interaction Engine ───────────────────────────────────────

async function executeInteraction(params: AppInteractionParams): Promise<AppInteractionResult> {
  const panel = getAppPanel();
  if (!panel) return { success: false, message: 'App panel not found in DOM' };

  switch (params.action) {
    case 'click': return handleClick(panel, params);
    case 'type': return handleType(panel, params);
    case 'scroll': return handleScroll(panel, params);
    case 'select': return handleSelect(params);
    case 'hover': return handleHover(params);
    case 'get-text': return handleGetText(panel, params);
    default: return { success: false, message: `Unknown action: ${params.action}` };
  }
}

function handleClick(panel: HTMLElement, p: AppInteractionParams): AppInteractionResult {
  if (p.selector) {
    const el = findInPanel(p.selector);
    if (!el) return { success: false, message: `No element found: ${p.selector}` };
    if (el instanceof HTMLElement) { el.focus(); el.click(); }
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { success: true, message: `Clicked: ${p.selector}` };
  }
  if (p.x !== undefined && p.y !== undefined) {
    const r = panel.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + p.x, r.top + p.y);
    if (!target) return { success: false, message: `No element at (${p.x}, ${p.y})` };
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + p.x, clientY: r.top + p.y }));
    return { success: true, message: `Clicked at (${p.x}, ${p.y})` };
  }
  return { success: false, message: 'Click requires selector or x,y coordinates' };
}

function handleType(panel: HTMLElement, p: AppInteractionParams): AppInteractionResult {
  if (!p.text) return { success: false, message: 'Type action requires text' };

  let target: Element | null = null;
  if (p.selector) {
    target = findInPanel(p.selector);
    if (!target) return { success: false, message: `No element found: ${p.selector}` };
    if (target instanceof HTMLElement) target.focus();
  } else {
    target = panel.contains(document.activeElement) ? document.activeElement : null;
    if (!target) return { success: false, message: 'No focused element. Use --selector.' };
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
    if (setter) { setter.call(target, target.value + p.text); target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true })); }
    else target.value += p.text;
    return { success: true, message: `Typed "${p.text}" into ${p.selector ?? 'focused element'}` };
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    document.execCommand('insertText', false, p.text);
    return { success: true, message: `Typed "${p.text}" into contenteditable` };
  }
  return { success: false, message: 'Target is not an input, textarea, or contenteditable' };
}

function handleScroll(panel: HTMLElement, p: AppInteractionParams): AppInteractionResult {
  const dir = p.direction ?? 'down';
  const amt = p.amount ?? 300;
  let target: Element = panel;
  if (p.selector) { const el = findInPanel(p.selector); if (el) target = el; }
  const map: Record<string, [number, number]> = { up: [0, -amt], down: [0, amt], left: [-amt, 0], right: [amt, 0] };
  const [dx, dy] = map[dir] ?? [0, amt];
  target.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
  return { success: true, message: `Scrolled ${dir} by ${amt}px` };
}

function handleSelect(p: AppInteractionParams): AppInteractionResult {
  if (!p.selector) return { success: false, message: 'Select requires a selector' };
  const el = findInPanel(p.selector);
  if (!el) return { success: false, message: `No element found: ${p.selector}` };
  if (el instanceof HTMLElement) el.focus();
  return { success: true, message: `Selected: ${p.selector}` };
}

function handleHover(p: AppInteractionParams): AppInteractionResult {
  if (!p.selector) return { success: false, message: 'Hover requires a selector' };
  const el = findInPanel(p.selector);
  if (!el) return { success: false, message: `No element found: ${p.selector}` };
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { success: true, message: `Hovered: ${p.selector}` };
}

function handleGetText(panel: HTMLElement, p: AppInteractionParams): AppInteractionResult {
  let target: Element = panel;
  if (p.selector) {
    const el = findInPanel(p.selector);
    if (!el) return { success: false, message: `No element found: ${p.selector}` };
    target = el;
  }
  const text = target.textContent?.trim() ?? '';
  return { success: true, message: `Text content (${text.length} chars)`, textContent: text };
}

// ── Recording State ──────────────────────────────────────────

let recordingActive = false;
let recordingStartedAt: string | null = null;

// ── Bridge Interface ─────────────────────────────────────────

interface AppControlBridge {
  getList(): AppControlEntry[];
  getActive(): string;
  openApp(appId: string): boolean;
  getInfo(appId: string): AppControlEntry | null;
  getAppRect(): AppPanelRect | null;
  interact(params: AppInteractionParams): Promise<AppInteractionResult>;
  recordStart(): boolean;
  recordStop(): boolean;
  getRecordingStatus(): AppRecordingStatus;
  /** Open a dev server URL as an in-app preview tab. */
  openDevPreview(url: string): boolean;
}

declare global {
  interface Window { __appControl?: AppControlBridge; }
}

function toEntry(app: { id: string; label: string; icon: string; builtin: boolean; manifest: { scope?: string; component?: string | null } | null }): AppControlEntry {
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
    getList: () => useAppStore.getState().apps.map(toEntry),
    getActive: () => useAppStore.getState().activeApp,
    openApp(appId) {
      const s = useAppStore.getState();
      if (!s.apps.some((a) => a.id === appId)) return false;
      openApp(appId);
      return true;
    },
    getInfo(appId) {
      const a = useAppStore.getState().apps.find((x) => x.id === appId);
      return a ? toEntry(a) : null;
    },
    getAppRect() {
      const el = document.querySelector(APP_PANEL_SELECTOR);
      if (!el) return null;
      // Returns CSS pixel coordinates. The main process converts these to DIP
      // coordinates before passing to capturePage() (see captureRect / captureAppScreenshot).
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    interact: executeInteraction,
    recordStart() {
      if (recordingActive) return false;
      if (!getAppPanel()) return false;
      recordingActive = true;
      recordingStartedAt = new Date().toISOString();
      return true;
    },
    recordStop() {
      if (!recordingActive) return false;
      recordingActive = false;
      recordingStartedAt = null;
      return true;
    },
    getRecordingStatus() {
      if (!recordingActive) return { recording: false };
      return {
        recording: true,
        startedAt: recordingStartedAt ?? undefined,
        durationMs: recordingStartedAt ? Date.now() - new Date(recordingStartedAt).getTime() : undefined,
      };
    },
    openDevPreview(url: string) {
      const s = useAppStore.getState();
      // Ensure we're on the coding workspace so the editor is visible
      if (s.activeApp !== 'coding') s.setActiveApp('coding');
      // Use the editor bridge to open a devserver:// tab
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
      useEditorBridge.getState().requestOpenFile(workspaceId, `devserver://${url}`);
      return true;
    },
  };
  return () => { delete window.__appControl; };
}
