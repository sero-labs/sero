/**
 * IPC handlers for the in-app browser. Every tab-scoped call carries the
 * renderer's claimed workspaceId and is validated against the tab's
 * actual workspace in the view manager — we don't trust the tab id
 * alone, because a compromised renderer could otherwise target tabs in
 * other workspaces.
 */

import { BrowserWindow, Menu, ipcMain, type MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  BrowserBookmarkContextAction,
  BrowserTabContextAction,
  BrowserViewBounds,
} from '@/types/browser';
import { browserViewManager } from '@electron/features/browser/view-manager';

function popupActionMenu<T extends string>(
  window: BrowserWindow | null,
  items: MenuItemConstructorOptions[],
): Promise<T | null> {
  if (!window) return Promise.resolve(null);
  return new Promise((resolve) => {
    let selected: T | null = null;
    const withPick = items.map((item) => {
      if (!('id' in item) || !item.id) return item;
      return {
        ...item,
        click: () => {
          selected = item.id as T;
          resolve(selected);
        },
      };
    });
    const menu = Menu.buildFromTemplate(withPick);
    menu.popup({ window, callback: () => { if (!selected) resolve(null); } });
  });
}

function showTabContextMenu(window: BrowserWindow | null): Promise<BrowserTabContextAction | null> {
  return popupActionMenu<BrowserTabContextAction>(window, [
    { id: 'bookmark', label: 'Bookmark Tab' },
    { id: 'copy-url', label: 'Copy URL' },
    { type: 'separator' },
    { id: 'close', label: 'Close' },
    { id: 'close-others', label: 'Close Others' },
    { id: 'close-all', label: 'Close All' },
  ]);
}

function showBookmarkContextMenu(window: BrowserWindow | null): Promise<BrowserBookmarkContextAction | null> {
  return popupActionMenu<BrowserBookmarkContextAction>(window, [
    { id: 'open', label: 'Open' },
    { id: 'open-new-tab', label: 'Open in New Tab' },
    { type: 'separator' },
    { id: 'edit', label: 'Edit…' },
    { id: 'delete', label: 'Delete' },
  ]);
}

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
    (event, bounds: BrowserViewBounds) => {
      // Renderer reports rects in CSS pixels (zoom-affected); WebContentsView
      // bounds are in DIP (zoom = 1). When the page is zoomed (Cmd+/Cmd-) or
      // running on a fractional-scale display, the two diverge and the native
      // view bleeds past sibling panels. Convert once at the boundary.
      const zoom = event.sender.getZoomFactor() || 1;
      browserViewManager.setBounds({
        x: Math.round(bounds.x * zoom),
        y: Math.round(bounds.y * zoom),
        width: Math.round(bounds.width * zoom),
        height: Math.round(bounds.height * zoom),
      });
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

  ipcMain.handle(
    IpcChannels.browser.grabElement,
    (_e, tabId: string, workspaceId: string) => {
      return browserViewManager.grabElement(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.cancelGrab,
    (_e, tabId: string, workspaceId: string) => {
      browserViewManager.cancelGrab(tabId, workspaceId);
    },
  );

  ipcMain.handle(
    IpcChannels.browser.showTabContextMenu,
    (event, tabId: string, workspaceId: string) => {
      if (browserViewManager.workspaceForTab(tabId) !== workspaceId) return null;
      return showTabContextMenu(BrowserWindow.fromWebContents(event.sender));
    },
  );

  ipcMain.handle(IpcChannels.browser.showBookmarkContextMenu, (event) => {
    return showBookmarkContextMenu(BrowserWindow.fromWebContents(event.sender));
  });
}
