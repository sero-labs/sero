/**
 * Main-process → renderer browser event handling. Split from
 * `stores/browser.ts` to keep the store under the 500-LOC rule.
 */

import type { StoreApi } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import {
  formatSelectionForChat,
  formatSelectionForMemory,
  prefillChatComposer,
  toPersistedTabs,
} from './browser-helpers';
import type { BrowserEvent, BrowserTab } from '@/types/browser';
import type { BrowserState } from './browser';

export function applyBrowserEvent(event: BrowserEvent, store: StoreApi<BrowserState>): void {
  const { setState: set, getState: get } = store;

  set((s) => {
    const tabs = s.tabs.map((t) => {
      if (t.id !== event.tabId) return t;
      switch (event.kind) {
        case 'did-navigate':
          return {
            ...t,
            url: event.url,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
          };
        case 'did-start-loading':
          return { ...t, isLoading: true };
        case 'did-stop-loading':
          return { ...t, isLoading: false };
        case 'title-updated':
          return { ...t, title: event.title || t.title };
        case 'favicon-updated':
          return { ...t, favicon: event.favicon };
        case 'did-fail-load':
          return { ...t, isLoading: false };
        default:
          return t;
      }
    });
    return { tabs };
  });

  if (event.kind === 'new-tab-request') {
    get().createTab(event.workspaceId, event.url);
    return;
  }

  if (event.kind === 'selection-to-chat') {
    prefillChatComposer(formatSelectionForChat(event.selection, event.pageUrl, event.pageTitle));
    return;
  }

  if (event.kind === 'selection-to-memory') {
    prefillChatComposer(formatSelectionForMemory(event.selection, event.pageUrl, event.pageTitle));
    return;
  }

  if (event.kind === 'host-tab-opened') {
    // Mirror the host-created tab into the renderer store so it shows up
    // in the tab strip. The view already exists in main; don't re-open it.
    if (get().tabs.some((t) => t.id === event.tabId)) return;
    const tab: BrowserTab = {
      id: event.tabId,
      workspaceId: event.workspaceId,
      url: event.url,
      title: event.url,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabIds: { ...s.activeTabIds, [event.workspaceId]: event.tabId },
    }));
    persistLayout({
      browserTabs: toPersistedTabs(get().tabs),
      activeBrowserTabIds: get().activeTabIds,
    });
    return;
  }

  if (event.kind === 'host-tab-activated') {
    if (!get().tabs.some((t) => t.id === event.tabId && t.workspaceId === event.workspaceId)) return;
    set((s) => ({
      activeTabIds: { ...s.activeTabIds, [event.workspaceId]: event.tabId },
    }));
    persistLayout({ activeBrowserTabIds: get().activeTabIds });
    return;
  }

  if (event.kind === 'host-tab-closed') {
    if (!get().tabs.some((t) => t.id === event.tabId)) return;
    const nextTabs = get().tabs.filter((t) => t.id !== event.tabId);
    const ws = event.workspaceId;
    const activeIds = { ...get().activeTabIds };
    if (activeIds[ws] === event.tabId) {
      const replacement = nextTabs.find((t) => t.workspaceId === ws) ?? null;
      activeIds[ws] = replacement ? replacement.id : null;
    }
    set({ tabs: nextTabs, activeTabIds: activeIds });
    persistLayout({
      browserTabs: toPersistedTabs(nextTabs),
      activeBrowserTabIds: activeIds,
    });
    return;
  }

  if (event.kind === 'did-navigate' || event.kind === 'title-updated') {
    persistLayout({ browserTabs: toPersistedTabs(get().tabs) });
  }
}
