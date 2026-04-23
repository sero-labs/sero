/**
 * IPC handlers for the in-app browser. Every tab-scoped call carries the
 * renderer's claimed workspaceId and is validated against the tab's
 * actual workspace in the view manager — we don't trust the tab id
 * alone, because a compromised renderer could otherwise target tabs in
 * other workspaces.
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

  ipcMain.handle(
    IpcChannels.browser.closeTab,
    (_e, tabId: string, workspaceId: string) => {
      browserViewManager.closeTab(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.setActive,
    (_e, tabId: string | null, workspaceId: string) => {
      browserViewManager.setActive(tabId, workspaceId);
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
    (_e, tabId: string, url: string, workspaceId: string) => {
      browserViewManager.navigate(tabId, url, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.goBack,
    (_e, tabId: string, workspaceId: string) => {
      browserViewManager.goBack(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.goForward,
    (_e, tabId: string, workspaceId: string) => {
      browserViewManager.goForward(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.reload,
    (_e, tabId: string, workspaceId: string) => {
      browserViewManager.reload(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.stop,
    (_e, tabId: string, workspaceId: string) => {
      browserViewManager.stop(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.extractPage,
    (_e, tabId: string, workspaceId: string) => {
      return browserViewManager.extractPage(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.capturePage,
    (
      _e,
      tabId: string,
      workspaceId: string,
      rect?: { x: number; y: number; width: number; height: number },
    ) => {
      return browserViewManager.capturePage(tabId, workspaceId, rect);
    },
  );
}
