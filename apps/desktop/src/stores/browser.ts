/**
 * Browser tab store — drives the in-app browser panel.
 *
 * Holds the renderer-side view of each tab (URL, title, favicon, loading,
 * history) while the actual WebContents lives in the main process. Events
 * pushed from `window.sero.browser.onEvent` keep the runtime metadata in
 * sync; every structural change (create/close/reorder/active) is persisted
 * into `layout.json` via `persistLayout`.
 */

import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import {
  BROWSER_HOME_URL,
  resolveAddressBarInput,
  type BrowserEvent,
  type BrowserTab,
} from '@/types/browser';
import type { PersistedBrowserTab } from '@/types/layout';

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;

  /** Create a new tab. Returns the new id. */
  createTab: (urlOrQuery?: string) => string;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  navigate: (id: string, urlOrQuery: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;
  stop: (id: string) => void;

  /** Hydrate from persisted layout state (called once on startup). */
  hydrate: (tabs: PersistedBrowserTab[] | undefined, activeId: string | null | undefined) => void;
  /** Ensure the main process has a WebContentsView for every tab. Idempotent. */
  ensureViewsOpen: () => void;
  /** Apply an event pushed from the main-process view manager. */
  applyEvent: (event: BrowserEvent) => void;
}

function generateTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPersisted(tabs: BrowserTab[]): PersistedBrowserTab[] {
  return tabs.map((t) => ({ id: t.id, url: t.url, title: t.title }));
}

function newTab(url: string): BrowserTab {
  return {
    id: generateTabId(),
    url,
    title: url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  createTab: (urlOrQuery) => {
    const url = urlOrQuery ? resolveAddressBarInput(urlOrQuery) : BROWSER_HOME_URL;
    const tab = newTab(url);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    void window.sero.browser.openTab(tab.id, url);
    void window.sero.browser.setActive(tab.id);
    persistLayout({
      browserTabs: toPersisted(get().tabs),
      activeBrowserTabId: tab.id,
    });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const nextTabs = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      // Prefer the neighbour to the right, fall back to the left.
      const neighbour = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
      nextActive = neighbour ? neighbour.id : null;
    }
    set({ tabs: nextTabs, activeTabId: nextActive });
    void window.sero.browser.closeTab(id);
    void window.sero.browser.setActive(nextActive);
    persistLayout({
      browserTabs: toPersisted(nextTabs),
      activeBrowserTabId: nextActive,
    });
  },

  setActive: (id) => {
    if (get().activeTabId === id) return;
    set({ activeTabId: id });
    void window.sero.browser.setActive(id);
    persistLayout({ activeBrowserTabId: id });
  },

  navigate: (id, urlOrQuery) => {
    const url = resolveAddressBarInput(urlOrQuery);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, url, isLoading: true } : t)),
    }));
    void window.sero.browser.navigate(id, url);
    persistLayout({ browserTabs: toPersisted(get().tabs) });
  },

  goBack: (id) => {
    void window.sero.browser.goBack(id);
  },
  goForward: (id) => {
    void window.sero.browser.goForward(id);
  },
  reload: (id) => {
    void window.sero.browser.reload(id);
  },
  stop: (id) => {
    void window.sero.browser.stop(id);
  },

  hydrate: (tabs, activeId) => {
    if (!tabs || tabs.length === 0) {
      set({ tabs: [], activeTabId: null });
      return;
    }
    const hydrated: BrowserTab[] = tabs.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title ?? t.url,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    }));
    const active = activeId && hydrated.some((t) => t.id === activeId)
      ? activeId
      : hydrated[0]?.id ?? null;
    set({ tabs: hydrated, activeTabId: active });
  },

  ensureViewsOpen: () => {
    const { tabs, activeTabId } = get();
    for (const tab of tabs) {
      // openTab is idempotent — the manager navigates the existing view if
      // the tab already has one.
      void window.sero.browser.openTab(tab.id, tab.url);
    }
    void window.sero.browser.setActive(activeTabId);
  },

  applyEvent: (event) => {
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

    // new-tab-request originates from window.open in the WebContents; open
    // a fresh tab with the requested URL.
    if (event.kind === 'new-tab-request') {
      get().createTab(event.url);
      return;
    }

    // Persist navigation and title changes so a restart restores the
    // current page, not whatever URL was first opened in the tab.
    if (event.kind === 'did-navigate' || event.kind === 'title-updated') {
      persistLayout({ browserTabs: toPersisted(get().tabs) });
    }
  },
}));
