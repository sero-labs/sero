/**
 * Preload bridge — Google + image generation IPC.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';

export const googleBridge = {
  execute: (service: string, subArgs: string[]) =>
    ipcRenderer.invoke(IpcChannels.google.execute, service, subArgs),
  authStatus: () => ipcRenderer.invoke(IpcChannels.google.authStatus),
  login: () => ipcRenderer.invoke(IpcChannels.google.login),
  logout: () => ipcRenderer.invoke(IpcChannels.google.logout),
  onAuthEvent: (cb: (event: any) => void) => {
    const handler = (_e: IpcRendererEvent, event: any) => cb(event);
    ipcRenderer.on(IpcChannels.google.authEvent, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.google.authEvent, handler);
    };
  },
};

export const imagegenBridge = {
  generate: (workspaceId: string, params: any): Promise<any> =>
    ipcRenderer.invoke(IpcChannels.imagegen.generate, workspaceId, params),
  readImage: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.imagegen.readImage, filePath),
  deleteImage: (
    workspaceId: string,
    generationId: number,
    singleImageId?: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.imagegen.deleteImage, workspaceId, generationId, singleImageId),
};
