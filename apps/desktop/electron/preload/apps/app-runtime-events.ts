/**
 * Preload bridge — app-runtime UI events.
 *
 * A plugin view subscribes to a topic its own runtime emits. Events for other
 * apps, workspaces or topics never reach the callback.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { AppRuntimeEvent } from '@/types/ipc';

export const appRuntimeBridge = {
  onEvent: (callback: (event: AppRuntimeEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AppRuntimeEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.appRuntime.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.appRuntime.event, handler);
    };
  },
  subscribe: (appId: string, workspaceId: string, topic: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.appRuntime.subscribe, appId, workspaceId, topic),
  unsubscribe: (appId: string, workspaceId: string, topic: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.appRuntime.unsubscribe, appId, workspaceId, topic),
};
