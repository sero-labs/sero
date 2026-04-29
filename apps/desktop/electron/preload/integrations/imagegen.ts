/**
 * Preload bridge — image generation IPC.
 *
 * Split from the retired Google/imagegen bridge so imagegen keeps a focused
 * shell-owned preload surface after the Google plugin cutover.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
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
