/**
 * Preload bridge for the debug and LSP IPC namespaces.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { LspNotificationEvent } from '@/lsp/lsp-protocol';

interface LspServerStoppedEvent {
  workspaceId: string;
  language: string;
}

export const debugBridge = {
  toggle: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.debug.toggle),

  getState: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.debug.getState),

  openLog: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.debug.openLog),

  clearLog: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.debug.clearLog),

  onStateChanged: (callback: (enabled: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean) => {
      callback(enabled);
    };
    ipcRenderer.on(IpcChannels.debug.stateChanged, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.debug.stateChanged, handler);
    };
  },
};

export const lspBridge = {
  start: (workspaceId: string, languageId: string) =>
    ipcRenderer.invoke(IpcChannels.lsp.start, workspaceId, languageId),
  stop: (workspaceId: string, language: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.lsp.stop, workspaceId, language),
  request: (workspaceId: string, language: string, method: string, params?: unknown) =>
    ipcRenderer.invoke(IpcChannels.lsp.request, workspaceId, language, method, params),
  notify: (workspaceId: string, language: string, method: string, params?: unknown): void =>
    ipcRenderer.send(IpcChannels.lsp.notify, workspaceId, language, method, params),
  hasServer: (workspaceId: string, language: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.lsp.hasServer, workspaceId, language),
  onNotification: (callback: (data: LspNotificationEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, data: LspNotificationEvent) => callback(data);
    ipcRenderer.on(IpcChannels.lsp.notification, handler);
    return () => { ipcRenderer.removeListener(IpcChannels.lsp.notification, handler); };
  },
  onServerStopped: (callback: (data: LspServerStoppedEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, data: LspServerStoppedEvent) => callback(data);
    ipcRenderer.on(IpcChannels.lsp.serverStopped, handler);
    return () => { ipcRenderer.removeListener(IpcChannels.lsp.serverStopped, handler); };
  },
};
