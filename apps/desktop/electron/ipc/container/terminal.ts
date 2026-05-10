/**
 * Terminal IPC handlers backed by RuntimeBackend terminals.
 *
 * Historical channel names remain under container/terminal for renderer
 * compatibility, but all terminal sessions are created via RuntimeManager.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { broadcastToWindows } from '../lib/window-broadcast';

export function registerTerminalHandlers(): void {
  runtimeManager.onTerminalExit((terminalId) => {
    broadcastToWindows(IpcChannels.terminal.exit, terminalId);
  });

  ipcMain.handle(
    IpcChannels.terminal.create,
    async (_event, workspaceId: string, terminalId: string, cols?: number, rows?: number) => {
      const { runtime, session } = await runtimeManager.createTerminal(workspaceId, terminalId, cols, rows);

      session.onData((data: string) => {
        broadcastToWindows(IpcChannels.terminal.data, terminalId, data);
      });

      return {
        runtime: runtime.backend === 'mac-host' ? 'host' : 'container',
        backend: runtime.backend,
      };
    },
  );

  ipcMain.handle(
    IpcChannels.terminal.write,
    async (_event, terminalId: string, data: string) => {
      try {
        runtimeManager.writeTerminal(terminalId, data);
      } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
        if (code !== 'EPIPE') {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[terminal] write error for ${terminalId}:`, message);
        }
      }
    },
  );

  ipcMain.handle(
    IpcChannels.terminal.resize,
    async (_event, terminalId: string, cols: number, rows: number) => {
      try {
        runtimeManager.resizeTerminal(terminalId, cols, rows);
      } catch {
        /* PTY may have exited */
      }
    },
  );

  ipcMain.handle(IpcChannels.terminal.replay, async (_event, terminalId: string) => {
    return runtimeManager.getTerminalReplayBuffer(terminalId);
  });

  ipcMain.handle(IpcChannels.terminal.dispose, async (_event, terminalId: string) => {
    runtimeManager.disposeTerminal(terminalId);
  });
}
