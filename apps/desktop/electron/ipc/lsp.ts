/**
 * LSP IPC handlers.
 *
 * Bridges renderer ↔ LspManager for language server lifecycle,
 * requests, and notifications. Forwards push events (diagnostics,
 * server stopped) to all renderer windows.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import { lspManager } from './shared-infra';

export function registerLspHandlers(): void {
  ipcMain.handle(
    IpcChannels.lsp.start,
    async (_e, workspaceId: string, languageId: string) => {
      return lspManager.startServer(workspaceId, languageId);
    },
  );

  ipcMain.handle(
    IpcChannels.lsp.stop,
    async (_e, workspaceId: string, language: string) => {
      await lspManager.stopServer(workspaceId, language);
    },
  );

  ipcMain.handle(
    IpcChannels.lsp.request,
    async (_e, workspaceId: string, language: string, method: string, params?: unknown) => {
      return lspManager.sendRequest(workspaceId, language, method, params);
    },
  );

  // Fire-and-forget: renderer uses ipcRenderer.send, no response needed.
  ipcMain.on(
    IpcChannels.lsp.notify,
    (_e, workspaceId: string, language: string, method: string, params?: unknown) => {
      lspManager.sendNotification(workspaceId, language, method, params);
    },
  );

  ipcMain.handle(
    IpcChannels.lsp.hasServer,
    async (_e, workspaceId: string, language: string) => {
      return lspManager.hasServer(workspaceId, language);
    },
  );

  // Forward LSP notifications (diagnostics etc.) to the renderer
  lspManager.on('notification', (data: { workspaceId: string; language: string; notification: any }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(IpcChannels.lsp.notification, data);
        }
      } catch { /* window may be closing */ }
    }
  });

  lspManager.on('serverStopped', (data: { workspaceId: string; language: string }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(IpcChannels.lsp.serverStopped, data);
        }
      } catch { /* window may be closing */ }
    }
  });
}
