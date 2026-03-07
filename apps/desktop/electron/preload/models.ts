/**
 * Preload bridge — model listing IPC.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { AvailableModelGroup } from '../../src/types/ipc';

export const modelsBridge = {
  list: (): Promise<AvailableModelGroup[]> =>
    ipcRenderer.invoke(IpcChannels.models.list),
};
