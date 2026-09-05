import { BrowserWindow, type WebContents, type WebFrameMain } from 'electron';

type IpcSendTarget = Pick<WebContents, 'send'>;
type MaybeWindow = BrowserWindow & { isDestroyed?: () => boolean };
type MaybeWebContents = WebContents & {
  mainFrame?: WebFrameMain;
  isCrashed?: () => boolean;
  isDestroyed?: () => boolean;
  isLoading?: () => boolean;
  isLoadingMainFrame?: () => boolean;
  getURL?: () => string;
};
type MaybeFrame = WebFrameMain & { isDestroyed?: () => boolean };

function getSendableTarget(window: BrowserWindow): IpcSendTarget | null {
  try {
    const maybeWindow = window as MaybeWindow;
    if (maybeWindow.isDestroyed?.()) return null;

    const contents = window.webContents as MaybeWebContents;
    if (contents.isDestroyed?.() || contents.isCrashed?.()) return null;
    if (contents.isLoading?.() || contents.isLoadingMainFrame?.()) return null;
    if (contents.getURL && !contents.getURL()) return null;

    const frame = contents.mainFrame as MaybeFrame | undefined;
    if (!frame) return contents;
    if (frame.isDestroyed?.() || frame.detached || !frame.url) return null;
    return frame;
  } catch {
    return null;
  }
}

export function broadcastToWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    const target = getSendableTarget(window);
    if (!target) continue;
    try {
      target.send(channel, ...args);
    } catch {
      // Window may be navigating or closing while the event fanout runs.
    }
  }
}

/** Send to the windows whose `webContents.id` is in `webContentsIds` only. */
export function sendToWindows(webContentsIds: ReadonlySet<number>, channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!webContentsIds.has(window.webContents.id)) continue;
    const target = getSendableTarget(window);
    if (!target) continue;
    try {
      target.send(channel, ...args);
    } catch {
      // Window may be navigating or closing while the event fanout runs.
    }
  }
}
