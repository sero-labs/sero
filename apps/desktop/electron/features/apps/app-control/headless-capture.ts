/**
 * Headless preview capture.
 *
 * The evidence check used to open a dev server in the visible Explorer panel
 * with `sero app preview` and screenshot the app panel. Opening that panel
 * switched the active app, so a capture run moved the user off the page they
 * were on, with no notice. This loads the URL in a hidden window instead:
 * nothing the user sees changes, no app has to be active, and the dev server
 * only has to answer, not render inside Sero's UI.
 *
 * The window holds content Sero does not own, so it is locked down the same way
 * an embedded webview is: no node, no preload, a sandbox, no child windows, no
 * dialogs, no downloads, and no permissions. It is also marked auxiliary, so no
 * other part of the process can mistake it for the Sero window.
 */

import { BrowserWindow, type Session } from 'electron';

import { markAuxiliaryWindow } from '@electron/shared/auxiliary-window';

/**
 * A dev server that never finishes loading must not hold the caller open. This
 * bounds the whole capture: load, paint and the PNG. A server that is slower
 * than this is a real finding, not a reason to wait longer.
 */
export const HEADLESS_CAPTURE_TIMEOUT_MS = 30_000;
/** A desktop viewport, so the layout the capture verifies is the desktop one. */
const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 800;
/**
 * Time to paint after the load event. A framework that renders on the first
 * frame is done by then; a spinner that has not resolved by then is what the
 * capture should show.
 */
const PAINT_SETTLE_MS = 500;
/** Chromium's net error for a navigation that another navigation replaced. */
const ERR_ABORTED = -3;

export interface HeadlessCaptureResult {
  ok: boolean;
  /** PNG bytes, base64. Present only when `ok`. */
  base64?: string;
  /** The URL that was loaded. Present only when `ok`. */
  url?: string;
  /** Why the capture did not happen. Present only when not `ok`. */
  error?: string;
}

/** Only the web can be captured; a local scheme would read Sero's own disk. */
export function isCapturableUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Sessions already locked down. The partition is shared by capture windows. */
const guardedSessions = new WeakSet<Session>();

function guardSession(session: Session): void {
  if (guardedSessions.has(session)) return;
  guardedSessions.add(session);
  // The capture partition is used by capture windows alone, so denying every
  // permission cannot affect anything else. A hidden window that a project page
  // can ask for the camera or the clipboard must not be granted one silently.
  // A preview that truly needs a device fails the capture instead.
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  // A download from a window the user cannot see would open a save dialog that
  // nobody can answer, and would write a file Sero never asked for.
  session.on('will-download', (event) => event.preventDefault());
}

/**
 * Loads the URL and resolves when the document that ends up loaded is ready.
 *
 * A page that redirects during load aborts its first navigation, and Electron
 * reports that abort through `loadURL` and `did-fail-load`. That is not a
 * capture failure: the navigation that replaced it finishes by itself, and its
 * `did-finish-load` is what this waits for.
 */
function loadUntilReady(win: BrowserWindow, url: string): Promise<void> {
  const contents = win.webContents;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      contents.off('did-finish-load', onLoaded);
      contents.off('did-fail-load', onFailed);
      if (error) reject(error);
      else resolve();
    };
    const onLoaded = (): void => finish();
    const onFailed = (
      _event: unknown,
      code: number,
      description: string,
      _url: string,
      isMainFrame: boolean,
    ): void => {
      if (!isMainFrame || code === ERR_ABORTED) return;
      finish(new Error(`${description} (${code})`));
    };
    contents.on('did-finish-load', onLoaded);
    contents.on('did-fail-load', onFailed);
    win.loadURL(url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // A redirect or a second navigation aborted this one; its own load ends
      // the wait. Any other rejection is the failure to report.
      if (message.includes('ERR_ABORTED')) return;
      finish(error instanceof Error ? error : new Error(message));
    });
  });
}

/**
 * Capture a URL in a hidden window and return the PNG.
 *
 * The caller decides what to do with the image; this only proves that a page
 * answered and painted. It never writes to disk, so a caller that wants a file
 * saves the returned bytes itself.
 */
export async function captureUrlHeadless(
  raw: string,
  options: { timeoutMs?: number } = {},
): Promise<HeadlessCaptureResult> {
  if (!isCapturableUrl(raw)) {
    return { ok: false, error: `Only http and https URLs can be captured: "${raw}" is not one.` };
  }
  const timeoutMs = options.timeoutMs ?? HEADLESS_CAPTURE_TIMEOUT_MS;
  let win: BrowserWindow | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    win = new BrowserWindow({
      show: false,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      useContentSize: true,
      // A window that never shows still has to paint for capturePage to have a
      // frame to return. This is the default; it is stated because the whole
      // capture rests on it.
      paintWhenInitiallyHidden: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        // A hidden window is throttled unless asked not to be, and a throttled
        // renderer may never paint.
        backgroundThrottling: false,
        // `alert()` during load would open a native box and hold the capture
        // until its limit. Nothing a page shows in a dialog is wanted here.
        disableDialogs: true,
        // In memory only: the capture reads and writes none of the user's
        // session data, and nothing it loads leaves a cookie behind.
        partition: 'sero-preview-capture',
      },
    });
    // Before it loads, so no lookup can see it as the Sero window.
    markAuxiliaryWindow(win);
    const contents = win.webContents;
    guardSession(contents.session);
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // A server redirect and a subframe navigation are navigations too. Only the
    // web is allowed, so a 302 to a local scheme, or an iframe that navigates
    // to one, cannot reach a handler on the user's machine.
    const blockNonWeb = (event: { preventDefault: () => void; url: string }): void => {
      if (!isCapturableUrl(event.url)) event.preventDefault();
    };
    contents.on('will-frame-navigate', blockNonWeb);
    contents.on('will-redirect', blockNonWeb);
    const window = win;
    const loadAndCapture = async (): Promise<HeadlessCaptureResult> => {
      await loadUntilReady(window, raw);
      await new Promise((resolve) => { setTimeout(resolve, PAINT_SETTLE_MS); });
      const image = await window.webContents.capturePage();
      if (image.isEmpty()) return { ok: false, error: `The capture of ${raw} was an empty image.` };
      return { ok: true, base64: image.toPNG().toString('base64'), url: raw };
    };
    // A failed load or a destroyed window is an answer, not a throw: the caller
    // reports it like any other failed capture.
    const capture = loadAndCapture().catch((error: unknown): HeadlessCaptureResult => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    const expired = new Promise<HeadlessCaptureResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: `Timed out after ${Math.round(timeoutMs / 1000)}s` }), timeoutMs);
    });
    return await Promise.race([capture, expired]);
  } finally {
    if (timer) clearTimeout(timer);
    if (win && !win.isDestroyed()) win.destroy();
  }
}
