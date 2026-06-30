/**
 * Preload bridge — session-independent subagent context (tools + skills).
 * Mirrors the models bridge; used by app modules via the sero bridge.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { AvailableContext } from '@sero-ai/common';

export const subagentContextBridge = {
  get: (workspaceId: string): Promise<AvailableContext> =>
    ipcRenderer.invoke(IpcChannels.subagentContext.get, workspaceId),
};
