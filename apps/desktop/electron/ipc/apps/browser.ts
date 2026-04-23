/**
 * IPC handlers for the in-app browser. Thin passthrough to
 * `browserViewManager` in the main process.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { BrowserViewBounds } from '@/types/browser';
import { browserViewManager } from '@electron/features/browser/view-manager';

export function registerBrowserHandlers(): void {
  ipcMain.handle(
    IpcChannels.browser.openTab,
    (_e, tabId: string, url: string, workspaceId: string) => {
      browserViewManager.openTab(tabId, url, workspaceId);
    },
  );

  ipcMain.handle(IpcChannels.browser.closeTab, (_e, tabId: string) => {
    browserViewManager.closeTab(tabId);
  });

  ipcMain.handle(
    IpcChannels.browser.setActive,
    (_e, tabId: string | null) => {
      browserViewManager.setActive(tabId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.setBounds,
    (_e, bounds: BrowserViewBounds) => {
      browserViewManager.setBounds(bounds);
    },
  );

  ipcMain.handle(IpcChannels.browser.hideAll, () => {
    browserViewManager.hideAll();
  });

  ipcMain.handle(
    IpcChannels.browser.navigate,
    (_e, tabId: string, url: string) => {
      browserViewManager.navigate(tabId, url);
    },
  );

  ipcMain.handle(IpcChannels.browser.goBack, (_e, tabId: string) => {
    browserViewManager.goBack(tabId);
  });

  ipcMain.handle(IpcChannels.browser.goForward, (_e, tabId: string) => {
    browserViewManager.goForward(tabId);
  });

  ipcMain.handle(IpcChannels.browser.reload, (_e, tabId: string) => {
    browserViewManager.reload(tabId);
  });

  ipcMain.handle(IpcChannels.browser.stop, (_e, tabId: string) => {
    browserViewManager.stop(tabId);
  });
}
