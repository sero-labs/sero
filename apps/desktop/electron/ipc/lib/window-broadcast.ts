import { BrowserWindow } from 'electron';

export function broadcastToWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      const windowDestroyed = typeof window.isDestroyed === 'function'
        ? window.isDestroyed()
        : false;
      const webContentsDestroyed = typeof window.webContents?.isDestroyed === 'function'
        ? window.webContents.isDestroyed()
        : false;
      if (windowDestroyed || webContentsDestroyed) {
        continue;
      }
      window.webContents.send(channel, ...args);
    } catch {
      // Window may be closing while the event fanout runs.
    }
  }
}
