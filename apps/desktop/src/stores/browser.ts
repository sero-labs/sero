/**
 * Browser tab store — drives the in-app browser panel.
 *
 * Holds the renderer-side view of each tab (URL, title, favicon, loading,
 * history) while the actual WebContents lives in the main process. Events
 * pushed from `window.sero.browser.onEvent` keep the runtime metadata in
 * sync; every structural change (create/close/reorder/active/bookmark) is
 * persisted into `layout.json` via `persistLayout`.
 */

import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import {
  BROWSER_HOME_URL,
  resolveAddressBarInput,
  type BrowserBookmark,
  type BrowserEvent,
  type BrowserTab,
} from '@/types/browser';
import type { PersistedBrowserBookmark, PersistedBrowserTab } from '@/types/layout';

/**
 * Format a page selection as a markdown blockquote with an attribution
 * line, ready to be inserted into the chat composer. Two trailing newlines
 * leave the cursor on a fresh line so the user can start typing their
 * question immediately.
 */
function formatSelectionForChat(
  selection: string,
  pageUrl: string,
  pageTitle: string,
): string {
  const trimmed = selection.replace(/\s+$/, '');
  const quoted = trimmed.split('\n').map((line) => `> ${line}`).join('\n');
  const title = pageTitle.trim();
  const attribution = title ? `— ${title} — ${pageUrl}` : `— ${pageUrl}`;
  return `${quoted}\n\n${attribution}\n\n`;
}

/** Drop a page selection into the focused (or active) chat session's composer. */
function dropSelectionInChat(
  selection: string,
  pageUrl: string,
  pageTitle: string,
): void {
  const sessionId =
    useAgentStore.getState().focusedSessionId ??
    useSessionStore.getState().activeSessionId;
  if (!sessionId) {
    console.warn('[browser] No chat session available — selection ignored.');
    return;
  }
  useAgentStore.getState().setComposerPrefill(sessionId, {
    requestId: generateId('sel'),
    text: formatSelectionForChat(selection, pageUrl, pageTitle),
    source: 'system',
  });
  // Make sure the panel is visible so the user can see the prefill.
  if (!useAppStore.getState().chatPanelOpen) {
    useAppStore.getState().setChatPanelOpen(true);
  }
}

/** Snapshot of a tab the user just closed, kept in-memory for ⌘Shift+T. */
interface ClosedTab {
  url: string;
  title: string;
  favicon?: string;
  closedAt: number;
}

const MAX_RECENTLY_CLOSED = 10;

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  bookmarks: BrowserBookmark[];
  /** Most-recently-closed first. In-memory only (not persisted). */
  recentlyClosed: ClosedTab[];

  /** Create a new tab. Returns the new id. */
  createTab: (urlOrQuery?: string) => string;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  reopenClosedTab: () => void;
  setActive: (id: string) => void;
  reorderTabs: (ids: string[]) => void;
  /** Switch to tab by zero-based index (⌘1..⌘9). Ignores out-of-range. */
  setActiveByIndex: (index: number) => void;
  /** Move active tab selection by delta (⌘Shift+[ / ⌘Shift+]). Wraps. */
  cycleActive: (delta: number) => void;
  navigate: (id: string, urlOrQuery: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;
  stop: (id: string) => void;

  /** Bookmarks. */
  addBookmark: (input: { title: string; url: string; favicon?: string }) => void;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, patch: Partial<Omit<BrowserBookmark, 'id'>>) => void;

  /** Hydrate from persisted layout state (called once on startup). */
  hydrate: (input: {
    tabs: PersistedBrowserTab[] | undefined;
    activeId: string | null | undefined;
    bookmarks: PersistedBrowserBookmark[] | undefined;
  }) => void;
  /** Ensure the main process has a WebContentsView for every tab. Idempotent. */
  ensureViewsOpen: () => void;
  /** Apply an event pushed from the main-process view manager. */
  applyEvent: (event: BrowserEvent) => void;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPersistedTabs(tabs: BrowserTab[]): PersistedBrowserTab[] {
  return tabs.map((t) => ({ id: t.id, url: t.url, title: t.title }));
}

function newTab(url: string): BrowserTab {
  return {
    id: generateId('tab'),
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
  bookmarks: [],
  recentlyClosed: [],

  createTab: (urlOrQuery) => {
    const url = urlOrQuery ? resolveAddressBarInput(urlOrQuery) : BROWSER_HOME_URL;
    const tab = newTab(url);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    void window.sero.browser.openTab(tab.id, url);
    void window.sero.browser.setActive(tab.id);
    persistLayout({
      browserTabs: toPersistedTabs(get().tabs),
      activeBrowserTabId: tab.id,
    });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId, recentlyClosed } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const closing = tabs[idx];
    const nextTabs = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      // Prefer the neighbour to the right, fall back to the left.
      const neighbour = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
      nextActive = neighbour ? neighbour.id : null;
    }
    const nextClosed = [
      { url: closing.url, title: closing.title, favicon: closing.favicon, closedAt: Date.now() },
      ...recentlyClosed,
    ].slice(0, MAX_RECENTLY_CLOSED);
    set({ tabs: nextTabs, activeTabId: nextActive, recentlyClosed: nextClosed });
    void window.sero.browser.closeTab(id);
    void window.sero.browser.setActive(nextActive);
    persistLayout({
      browserTabs: toPersistedTabs(nextTabs),
      activeBrowserTabId: nextActive,
    });
  },

  closeOtherTabs: (id) => {
    const { tabs } = get();
    for (const t of tabs) {
      if (t.id !== id) get().closeTab(t.id);
    }
  },

  closeAllTabs: () => {
    const { tabs } = get();
    for (const t of tabs) get().closeTab(t.id);
  },

  reopenClosedTab: () => {
    const [last, ...rest] = get().recentlyClosed;
    if (!last) return;
    set({ recentlyClosed: rest });
    get().createTab(last.url);
  },

  setActive: (id) => {
    if (get().activeTabId === id) return;
    set({ activeTabId: id });
    void window.sero.browser.setActive(id);
    persistLayout({ activeBrowserTabId: id });
  },

  reorderTabs: (ids) => {
    const { tabs } = get();
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const reordered = ids
      .map((id) => byId.get(id))
      .filter((t): t is BrowserTab => Boolean(t));
    // Append any tabs the caller forgot (defensive — keeps us from silently dropping tabs).
    for (const t of tabs) {
      if (!ids.includes(t.id)) reordered.push(t);
    }
    set({ tabs: reordered });
    persistLayout({ browserTabs: toPersistedTabs(reordered) });
  },

  setActiveByIndex: (index) => {
    const tab = get().tabs[index];
    if (tab) get().setActive(tab.id);
  },

  cycleActive: (delta) => {
    const { tabs, activeTabId } = get();
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    // Modulo that handles negatives (JS % keeps sign of dividend).
    const len = tabs.length;
    const next = idx < 0 ? 0 : ((idx + delta) % len + len) % len;
    get().setActive(tabs[next].id);
  },

  navigate: (id, urlOrQuery) => {
    const url = resolveAddressBarInput(urlOrQuery);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, url, isLoading: true } : t)),
    }));
    void window.sero.browser.navigate(id, url);
    persistLayout({ browserTabs: toPersistedTabs(get().tabs) });
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

  addBookmark: (input) => {
    const { bookmarks } = get();
    // Dedupe on URL — updating the existing entry if the title has changed.
    const existing = bookmarks.find((b) => b.url === input.url);
    const next = existing
      ? bookmarks.map((b) =>
          b.id === existing.id
            ? { ...b, title: input.title || b.title, favicon: input.favicon ?? b.favicon }
            : b,
        )
      : [
          ...bookmarks,
          {
            id: generateId('bm'),
            title: input.title || input.url,
            url: input.url,
            ...(input.favicon !== undefined ? { favicon: input.favicon } : {}),
          },
        ];
    set({ bookmarks: next });
    persistLayout({ browserBookmarks: next });
  },

  removeBookmark: (id) => {
    const next = get().bookmarks.filter((b) => b.id !== id);
    set({ bookmarks: next });
    persistLayout({ browserBookmarks: next });
  },

  updateBookmark: (id, patch) => {
    const next = get().bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    set({ bookmarks: next });
    persistLayout({ browserBookmarks: next });
  },

  hydrate: ({ tabs, activeId, bookmarks }) => {
    const hydratedTabs: BrowserTab[] = (tabs ?? []).map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title ?? t.url,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    }));
    const active = activeId && hydratedTabs.some((t) => t.id === activeId)
      ? activeId
      : hydratedTabs[0]?.id ?? null;
    set({
      tabs: hydratedTabs,
      activeTabId: active,
      bookmarks: bookmarks ?? [],
    });
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

    if (event.kind === 'selection-to-chat') {
      dropSelectionInChat(event.selection, event.pageUrl, event.pageTitle);
      return;
    }

    // Persist navigation and title changes so a restart restores the
    // current page, not whatever URL was first opened in the tab.
    if (event.kind === 'did-navigate' || event.kind === 'title-updated') {
      persistLayout({ browserTabs: toPersistedTabs(get().tabs) });
    }
  },
}));
