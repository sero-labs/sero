/**
 * Preload bridge — Google + image generation IPC.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { GoogleAuthProgress, GoogleAuthStatus } from '@electron/features/auth/google/types';
import type { ImageGenParams, ImageGenResult } from '@electron/features/agent/assistants/image-agent';

interface PersistedImageGeneration {
  id: number;
  prompt: string;
  negativePrompt?: string;
  model: ImageGenParams['model'];
  aspectRatio: ImageGenParams['aspectRatio'];
  images: ImageGenResult['images'];
  createdAt: string;
}

interface ImageGenGenerateResult {
  generation: PersistedImageGeneration | null;
  error?: string;
}

interface GogExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const googleBridge = {
  execute: (service: string, subArgs: string[]): Promise<GogExecResult> =>
    ipcRenderer.invoke(IpcChannels.google.execute, service, subArgs),
  authStatus: (): Promise<GoogleAuthStatus> => ipcRenderer.invoke(IpcChannels.google.authStatus),
  login: () => ipcRenderer.invoke(IpcChannels.google.login),
  logout: () => ipcRenderer.invoke(IpcChannels.google.logout),
  onAuthEvent: (cb: (event: GoogleAuthProgress) => void) => {
    const handler = (_e: IpcRendererEvent, event: GoogleAuthProgress) => cb(event);
    ipcRenderer.on(IpcChannels.google.authEvent, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.google.authEvent, handler);
    };
  },
};

export const imagegenBridge = {
  generate: (workspaceId: string, params: ImageGenParams): Promise<ImageGenGenerateResult> =>
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
