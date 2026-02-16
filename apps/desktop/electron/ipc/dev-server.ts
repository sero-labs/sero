/**
 * Dev Server IPC handlers.
 *
 * Exposes the DevServerRegistry to the renderer via IPC and pushes
 * real-time events (registered, unregistered, status_changed) as they occur.
 */

import { ipcMain, BrowserWindow, shell } from 'electron';
import { IpcChannels, type DevServerEvent } from '../../src/types/ipc';
import { containerManager } from './shared-infra';

/** Push a dev server event to all renderer windows. */
function sendEvent(event: DevServerEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.devServer.event, event);
  }
}

export function registerDevServerHandlers(): void {
  const registry = containerManager.devServers;

  // Forward registry events to the renderer
  registry.onChange((event) => {
    sendEvent(event);
  });

  // ── List registered dev servers ────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.list,
    async (_event, workspaceId?: string) => {
      return registry.list(workspaceId);
    },
  );

  // ── Stop a dev server ──────────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.stop,
    async (_event, serverId: string) => {
      const ok = await registry.stop(serverId);
      if (!ok) throw new Error(`Failed to stop dev server: ${serverId}`);
    },
  );

  // ── Restart a dev server ───────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.restart,
    async (_event, serverId: string) => {
      const ok = await registry.restart(serverId);
      if (!ok) throw new Error(`Failed to restart dev server: ${serverId}`);
    },
  );

  // ── Unregister a dev server ────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.unregister,
    async (_event, serverId: string) => {
      registry.unregister(serverId);
    },
  );

  // ── Open in browser ────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.openInBrowser,
    async (_event, serverId: string) => {
      const server = registry.get(serverId);
      if (!server) throw new Error(`Dev server not found: ${serverId}`);
      await shell.openExternal(server.url);
    },
  );
}
