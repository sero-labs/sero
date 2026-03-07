/**
 * Preload bridge — 4-agent collaboration IPC.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { CollaborationResult, CollaborationEvent } from '../../src/types/collaboration';

export const collaborationBridge = {
  prompt: (
    sessionId: string,
    workspaceId: string,
    query: string,
  ): Promise<CollaborationResult> =>
    ipcRenderer.invoke(IpcChannels.collaboration.prompt, sessionId, workspaceId, query),

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
