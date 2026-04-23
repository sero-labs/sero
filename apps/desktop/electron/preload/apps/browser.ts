import { ipcRenderer, type IpcRendererEvent } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { BrowserEvent, BrowserViewBounds } from '@/types/browser';

export const browserBridge = {
  openTab: (tabId: string, url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.openTab, tabId, url),
  closeTab: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.closeTab, tabId),
  setActive: (tabId: string | null): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.setActive, tabId),
  setBounds: (bounds: BrowserViewBounds): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.setBounds, bounds),
  hideAll: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.hideAll),
  navigate: (tabId: string, url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.navigate, tabId, url),
  goBack: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.goBack, tabId),
  goForward: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.goForward, tabId),
  reload: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.reload, tabId),
  stop: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.stop, tabId),
  onEvent: (callback: (event: BrowserEvent) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, event: BrowserEvent) => callback(event);
    ipcRenderer.on(IpcChannels.browser.event, listener);
    return () => ipcRenderer.off(IpcChannels.browser.event, listener);
  },
};
