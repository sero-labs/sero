/**
 * Preload bridge for auto-update.
 *
 * Exposed on `window.sero.updater`.
 */

import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { UpdaterStatusEvent } from '@/types/ipc';

export const updaterBridge = {
  check: (): Promise<void> => ipcRenderer.invoke(IpcChannels.updater.check),
  getStatus: (): Promise<UpdaterStatusEvent> => ipcRenderer.invoke(IpcChannels.updater.getStatus),
  restartToUpdate: (): Promise<void> => ipcRenderer.invoke(IpcChannels.updater.restart),
  onEvent: (handler: (event: UpdaterStatusEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: UpdaterStatusEvent): void => {
      handler(payload);
    };
    ipcRenderer.on(IpcChannels.updater.event, listener);
    return () => ipcRenderer.removeListener(IpcChannels.updater.event, listener);
  },
};
