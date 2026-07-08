import { ipcRenderer, webFrame, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { ZoomCommand } from '@/types/window-chrome';

export const windowBridge = {
  minimize: (): Promise<void> => ipcRenderer.invoke(IpcChannels.window.minimize),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke(IpcChannels.window.toggleMaximize),
  close: (): Promise<void> => ipcRenderer.invoke(IpcChannels.window.close),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.window.isMaximized),
  onMaximizedChanged: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on(IpcChannels.window.maximizedChanged, listener);
    return () => ipcRenderer.removeListener(IpcChannels.window.maximizedChanged, listener);
  },
  setOverlayColors: (colors: { color: string; symbolColor: string }): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.window.setOverlayColors, colors),
  onZoomCommand: (callback: (command: ZoomCommand) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, command: ZoomCommand) => callback(command);
    ipcRenderer.on(IpcChannels.window.zoomCommand, listener);
    return () => ipcRenderer.removeListener(IpcChannels.window.zoomCommand, listener);
  },
  // Zoom applies in-process via webFrame — no main-process round trip.
  setZoomFactor: (factor: number): void => webFrame.setZoomFactor(factor),
};
