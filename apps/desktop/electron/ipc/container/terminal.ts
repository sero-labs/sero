/**
 * Terminal IPC handlers.
 *
 * Creates interactive terminal sessions inside workspace containers
 * and bridges data between node-pty and the renderer's xterm.js.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { containerManager } from '@electron/shared/infra/shared-infra';
import { workspaceManager } from '@electron/features/workspace/manager';
import { broadcastToWindows } from '../lib/window-broadcast';

export function registerTerminalHandlers(): void {
  const tm = containerManager.terminals;

  // Register exit callback once — forwards to all renderer windows
  tm.onTerminalExit((terminalId) => {
    broadcastToWindows(IpcChannels.terminal.exit, terminalId);
  });

  // Create a terminal — container-mode or host-mode depending on workspace config
  ipcMain.handle(
    IpcChannels.terminal.create,
    async (_event, workspaceId: string, terminalId: string, cols?: number, rows?: number) => {
      const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);
      const wsPath = workspaceManager.getPath(workspaceId) ?? process.cwd();

      // Use container terminal only if container mode is on AND the container is running
      const useContainer = containerEnabled && containerManager.hasContainer(workspaceId);
      const pty = useContainer
        ? tm.createTerminal(workspaceId, terminalId, cols, rows)
        : tm.createHostTerminal(workspaceId, terminalId, wsPath, cols, rows);

      // Forward PTY data to all renderer windows
      pty.onData((data: string) => {
        broadcastToWindows(IpcChannels.terminal.data, terminalId, data);
      });
    },
  );

  // Write data to a terminal (user keyboard input)
  ipcMain.handle(
    IpcChannels.terminal.write,
    async (_event, terminalId: string, data: string) => {
      const proc = tm.getTerminal(terminalId);
      if (proc) {
        try {
          proc.write(data);
        } catch (err: unknown) {
          const e = err as Record<string, unknown>;
          if (e?.code !== 'EPIPE') {
            console.warn(`[terminal] write error for ${terminalId}:`, e?.message);
          }
        }
      }
    },
  );

  // Resize a terminal
  ipcMain.handle(
    IpcChannels.terminal.resize,
    async (_event, terminalId: string, cols: number, rows: number) => {
      const proc = tm.getTerminal(terminalId);
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
    return tm.getReplayBuffer(terminalId);
  });

  // Dispose a terminal
  ipcMain.handle(IpcChannels.terminal.dispose, async (_event, terminalId: string) => {
    tm.disposeTerminal(terminalId);
  });
}
