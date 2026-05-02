import { BrowserWindow } from 'electron';

export function broadcastToWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      const isWindowAlive = !window.isDestroyed?.() && !window.webContents?.isDestroyed?.();
      if (!isWindowAlive) {
        continue;
      }
      window.webContents.send(channel, ...args);
    } catch {
      // Window may be closing while the event fanout runs.
    }
  }
}
