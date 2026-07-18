/**
 * Native keyboard shortcuts for browser tabs (Cmd/Ctrl+T/W/R, tab cycling,
 * history). Runs inside each WebContentsView's before-input-event so the
 * shortcuts work while the page has focus.
 */

import type { Event, Input } from 'electron';
import { BROWSER_HOME_URL } from '@/types/browser';
import type { BrowserViewManager } from './view-manager';

export function handleBrowserShortcut(
  manager: BrowserViewManager,
  event: Event,
  input: Input,
  tabId: string,
  workspaceId: string,
): void {
  if (input.type !== 'keyDown' || (!input.meta && !input.control) || input.alt) return;
  const key = input.key.toLowerCase();
  const loaded = manager.listLoadedTabs(workspaceId);
  const activeId = manager.resolveActiveTabForWorkspace(workspaceId) ?? tabId;
  const activeWc = manager.webContentsFor(activeId, workspaceId);

  if (input.shift && (key === '[' || key === ']')) {
    event.preventDefault();
    manager.activateByOffset(workspaceId, key === '[' ? -1 : 1);
    return;
  }
  if (input.shift) return;

  if (/^[1-9]$/.test(key)) {
    event.preventDefault();
    const index = key === '9' ? loaded.length - 1 : Number(key) - 1;
    const target = loaded[index];
    if (target) manager.setActive(target.id, workspaceId);
    return;
  }

  switch (key) {
    case 't':
      event.preventDefault();
      manager.openTabForHost(BROWSER_HOME_URL, workspaceId);
      return;
    case 'w':
      event.preventDefault();
      manager.closeTabForHost(activeId, workspaceId);
      return;
    case 'r':
      event.preventDefault();
      activeWc?.reload();
      return;
    case '[':
      if (activeWc?.navigationHistory.canGoBack()) {
        event.preventDefault();
        activeWc.navigationHistory.goBack();
      }
      return;
    case ']':
      if (activeWc?.navigationHistory.canGoForward()) {
        event.preventDefault();
        activeWc.navigationHistory.goForward();
      }
      return;
  }
}
