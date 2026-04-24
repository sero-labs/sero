import { ipcRenderer, type IpcRendererEvent } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type {
  BrowserBookmarkContextAction,
  BrowserEvent,
  BrowserTabContextAction,
  BrowserViewBounds,
} from '@/types/browser';

/**
 * Every tab-scoped bridge method takes a `workspaceId` alongside the tab
 * id. Main validates that the tab actually belongs to that workspace
 * before acting — don't trust the renderer to stay honest about which
 * workspace it's currently scoped to.
 */
export const browserBridge = {
  openTab: (tabId: string, url: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.openTab, tabId, url, workspaceId),
  closeTab: (tabId: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.closeTab, tabId, workspaceId),
  setActive: (tabId: string | null, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.setActive, tabId, workspaceId),
  setBounds: (bounds: BrowserViewBounds): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.setBounds, bounds),
  hideAll: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.hideAll),
  navigate: (tabId: string, url: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.navigate, tabId, url, workspaceId),
  goBack: (tabId: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.goBack, tabId, workspaceId),
  goForward: (tabId: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.goForward, tabId, workspaceId),
  reload: (tabId: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.reload, tabId, workspaceId),
  stop: (tabId: string, workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.browser.stop, tabId, workspaceId),
  extractPage: (
    tabId: string,
    workspaceId: string,
  ): Promise<{ title: string; url: string; text: string } | null> =>
    ipcRenderer.invoke(IpcChannels.browser.extractPage, tabId, workspaceId),
  capturePage: (
    tabId: string,
    workspaceId: string,
    rect?: { x: number; y: number; width: number; height: number },
  ): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.browser.capturePage, tabId, workspaceId, rect),
  showTabContextMenu: (tabId: string, workspaceId: string): Promise<BrowserTabContextAction | null> =>
    ipcRenderer.invoke(IpcChannels.browser.showTabContextMenu, tabId, workspaceId),
  showBookmarkContextMenu: (): Promise<BrowserBookmarkContextAction | null> =>
    ipcRenderer.invoke(IpcChannels.browser.showBookmarkContextMenu),
  onEvent: (callback: (event: BrowserEvent) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, event: BrowserEvent) => callback(event);
    ipcRenderer.on(IpcChannels.browser.event, listener);
    return () => ipcRenderer.off(IpcChannels.browser.event, listener);
  },
};
