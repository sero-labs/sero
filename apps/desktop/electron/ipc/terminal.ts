/**
 * Terminal IPC handlers.
 *
 * Creates interactive terminal sessions inside workspace containers
 * and bridges data between node-pty and the renderer's xterm.js.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import { containerManager } from './shared-infra';

export function registerTerminalHandlers(): void {
  // Create a terminal in a workspace's container
  ipcMain.handle(
    IpcChannels.terminal.create,
    async (_event, workspaceId: string, terminalId: string, cols?: number, rows?: number) => {
      const pty = containerManager.createTerminal(workspaceId, terminalId, cols, rows);

      // Forward PTY data to all renderer windows
      pty.onData((data: string) => {
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            if (!win.isDestroyed()) {
              win.webContents.send(IpcChannels.terminal.data, terminalId, data);
            }
          } catch {
            /* window may be closing */
          }
        }
      });

      // Notify renderer when terminal exits
      pty.onExit(() => {
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            if (!win.isDestroyed()) {
              win.webContents.send(IpcChannels.terminal.exit, terminalId);
            }
          } catch {
            /* window may be closing */
          }
        }
      });
    },
  );

  // Write data to a terminal (user keyboard input)
  ipcMain.handle(
    IpcChannels.terminal.write,
    async (_event, terminalId: string, data: string) => {
      const proc = containerManager.getTerminal(terminalId);
      if (proc) {
        try {
          proc.write(data);
        } catch (err: any) {
          if (err?.code !== 'EPIPE') {
            console.warn(`[terminal] write error for ${terminalId}:`, err?.message);
          }
        }
      }
    },
  );

  // Resize a terminal
  ipcMain.handle(
    IpcChannels.terminal.resize,
    async (_event, terminalId: string, cols: number, rows: number) => {
      const proc = containerManager.getTerminal(terminalId);
      if (proc) {
        try {
          proc.resize(cols, rows);
        } catch {
          /* PTY may have exited */
        }
      }
    },
  );

  // Get buffered output for replay when xterm.js remounts
  ipcMain.handle(IpcChannels.terminal.replay, async (_event, terminalId: string) => {
    return containerManager.getReplayBuffer(terminalId);
  });

  // Dispose a terminal
  ipcMain.handle(IpcChannels.terminal.dispose, async (_event, terminalId: string) => {
    containerManager.disposeTerminal(terminalId);
  });
}
