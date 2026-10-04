/**
 * Windows Sero opens that are not its own app window: today, a hidden preview
 * capture, and anything else created off-screen later.
 *
 * Electron does not promise an order in `BrowserWindow.getAllWindows()`, and
 * every "the main window" lookup in this process takes the first entry. A
 * capture window that takes that place is shown to the user by a notification
 * click, receives app-control JavaScript meant for the Sero renderer, and
 * parents a dialog nobody can see. Anything that must act on Sero's own window
 * asks here instead of reading the list itself.
 *
 * A send to an auxiliary window is harmless: it has no preload, so the message
 * is dropped. A capture, a dialog parent and a focus call are not.
 */

import { BrowserWindow } from 'electron';

const auxiliary = new WeakSet<BrowserWindow>();

/** Marks a window as not being Sero's app window. Call it before it loads. */
export function markAuxiliaryWindow(win: BrowserWindow): void {
  auxiliary.add(win);
}

export function isAuxiliaryWindow(win: BrowserWindow): boolean {
  return auxiliary.has(win);
}

/** Sero's own windows, in Electron's order, without the auxiliary ones. */
export function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((win) => !isAuxiliaryWindow(win));
}

/** Sero's app window, or null while it is closed. */
export function appWindow(): BrowserWindow | null {
  return appWindows()[0] ?? null;
}

/**
 * Destroys every auxiliary window. Called when the app window closes, so a
 * capture left running cannot keep the process alive past the user's wish to
 * quit.
 */
export function closeAuxiliaryWindows(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!isAuxiliaryWindow(win) || win.isDestroyed()) continue;
    win.destroy();
  }
}
