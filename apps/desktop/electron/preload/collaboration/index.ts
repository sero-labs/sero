/**
 * Preload bridge — collaboration IPC.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc';
import type {
  CollaborationResult,
  CollaborationStateSnapshot,
  CollaborationEvent,
  CollaborationConfig,
} from '@/types/collaboration';

export const collaborationBridge = {
  prompt: (
    sessionId: string,
    workspaceId: string,
    query: string,
    config?: CollaborationConfig,
  ): Promise<CollaborationResult> =>
    ipcRenderer.invoke(IpcChannels.collaboration.prompt, sessionId, workspaceId, query, config),

  getState: (sessionId: string): Promise<CollaborationStateSnapshot | null> =>
    ipcRenderer.invoke(IpcChannels.collaboration.getState, sessionId),

  onEvent: (callback: (event: CollaborationEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: CollaborationEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.collaboration.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.collaboration.event, handler);
    };
  },
};
