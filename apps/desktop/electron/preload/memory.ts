/**
 * Memory preload bridge — exposes scratchpad reads to the renderer.
 *
 * Kept intentionally narrow: list open items + subscribe to changes.
 * Mutations go through the agent's `scratchpad` tool (via chat).
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';

export interface ScratchpadListResult {
  path: string;
  openCount: number;
  openItems: Array<{ text: string }>;
}

export const memoryBridge = {
  scratchpad: {
    list: (): Promise<ScratchpadListResult> =>
      ipcRenderer.invoke(IpcChannels.memory.scratchpadList),
    onChanged: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on(IpcChannels.memory.scratchpadChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.memory.scratchpadChanged, handler);
    },
  },
};
