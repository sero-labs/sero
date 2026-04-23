/**
 * Browser-scoped keyboard shortcuts. Only active while the BrowserPanel is
 * mounted — avoids hijacking keys (⌘W, ⌘R, ⌘T) when the user is in the
 * editor or another app.
 *
 * ⌘T          New tab
 * ⌘W          Close active tab
 * ⌘Shift+T    Reopen last closed tab
 * ⌘R          Reload active tab
 * ⌘D          Bookmark active tab
 * ⌘[ / ⌘]     Back / forward
 * ⌘1..⌘9      Jump to tab N (⌘9 jumps to the last tab, mirroring Chrome)
 * ⌘Shift+[/]  Cycle active tab left / right
 */

import { useEffect } from 'react';
import { useBrowserStore } from '@/stores/browser';

export function useBrowserShortcuts(workspaceId: string) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.altKey) return;

      const store = useBrowserStore.getState();
      const activeId = store.activeTabIds[workspaceId] ?? null;
      const key = e.key.toLowerCase();

      // ⌘Shift+… combinations first so plain ⌘+… doesn't swallow them.
      if (e.shiftKey) {
        switch (key) {
          case 't':
            e.preventDefault();
            store.reopenClosedTab(workspaceId);
            return;
          case '[':
            e.preventDefault();
            store.cycleActive(workspaceId, -1);
            return;
          case ']':
            e.preventDefault();
            store.cycleActive(workspaceId, 1);
            return;
        }
        return;
      }

      switch (key) {
        case 't':
          e.preventDefault();
          store.createTab(workspaceId);
          return;
        case 'w':
          if (activeId) {
            e.preventDefault();
            store.closeTab(activeId);
          }
          return;
        case 'r':
          if (activeId) {
            e.preventDefault();
            store.reload(activeId);
          }
          return;
        case 'd':
          if (activeId) {
            const tab = store.tabs.find((t) => t.id === activeId);
            if (tab) {
              e.preventDefault();
              store.addBookmark({
                title: tab.title || tab.url,
                url: tab.url,
                favicon: tab.favicon,
              });
            }
          }
          return;
        case '[':
          if (activeId) {
            e.preventDefault();
            store.goBack(activeId);
          }
          return;
        case ']':
          if (activeId) {
            e.preventDefault();
            store.goForward(activeId);
          }
          return;
      }

      // ⌘1 … ⌘8 → jump to that tab; ⌘9 → last tab (Chrome convention).
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const digit = parseInt(e.key, 10);
        const wsTabs = store.tabs.filter((t) => t.workspaceId === workspaceId);
        if (digit === 9) store.setActiveByIndex(workspaceId, wsTabs.length - 1);
        else store.setActiveByIndex(workspaceId, digit - 1);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [workspaceId]);
}
