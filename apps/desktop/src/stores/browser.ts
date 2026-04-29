/**
 * Browser tab store — drives the in-app browser panel.
 *
 * Tabs belong to a workspace (cookies/sessions are isolated via per-workspace
 * partitions in the main-process view manager). The renderer keeps the flat
 * `tabs` list but filters by workspace at the UI edge. `activeTabIds` is a
 * per-workspace map so switching workspaces snaps back to each one's last
 * active tab.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persistLayout } from '@/lib/persist-layout';
import {
  formatSelectionForChat,
  formatSelectionForMemory,
  prefillChatComposer,
} from './browser-helpers';
import {
  BROWSER_HOME_URL,
  resolveAddressBarInput,
  type BrowserBookmark,
  type BrowserEvent,
  type BrowserTab,
} from '@/types/browser';
import type { PersistedBrowserBookmark, PersistedBrowserTab } from '@/types/layout';

/** Snapshot of a tab the user just closed, kept in-memory for ⌘Shift+T. */
interface ClosedTab {
  workspaceId: string;
  url: string;
  title: string;
  favicon?: string;
  closedAt: number;
}

const MAX_RECENTLY_CLOSED = 10;

interface BrowserState {
  tabs: BrowserTab[];
  /** Active tab id per workspace. */
  activeTabIds: Record<string, string | null>;
  bookmarks: BrowserBookmark[];
  /** Most-recently-closed first. In-memory only (not persisted). */
  recentlyClosed: ClosedTab[];

  /** Create a new tab under the given workspace. Returns the new id. */
  createTab: (workspaceId: string, urlOrQuery?: string) => string;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: (workspaceId: string) => void;
  reopenClosedTab: (workspaceId: string) => void;
  setActive: (id: string) => void;
  reorderTabs: (workspaceId: string, ids: string[]) => void;
  /** Switch to tab at zero-based index within the workspace (⌘1..⌘9). */
  setActiveByIndex: (workspaceId: string, index: number) => void;
  /** Cycle active tab left/right within the workspace (wraps). */
  cycleActive: (workspaceId: string, delta: number) => void;
  navigate: (id: string, urlOrQuery: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;
  stop: (id: string) => void;
  /** Extract the tab's page (title + plain text) and prefill the chat composer. */
  sharePageWithChat: (id: string) => Promise<void>;

  addBookmark: (input: { title: string; url: string; favicon?: string }) => void;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, patch: Partial<Omit<BrowserBookmark, 'id'>>) => void;

  hydrate: (input: {
    tabs: PersistedBrowserTab[] | undefined;
    activeIds: Record<string, string | null> | undefined;
    legacyActiveId: string | null | undefined;
    bookmarks: PersistedBrowserBookmark[] | undefined;
  }) => void;
  /** Ensure the main process has a WebContentsView for every tab in a workspace. */
  ensureViewsOpen: (workspaceId: string) => void;
  applyEvent: (event: BrowserEvent) => void;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPersistedTabs(tabs: BrowserTab[]): PersistedBrowserTab[] {
  return tabs.map((t) => ({ id: t.id, workspaceId: t.workspaceId, url: t.url, title: t.title }));
}

function newTab(workspaceId: string, url: string): BrowserTab {
  return {
    id: generateId('tab'),
    workspaceId,
    url,
    title: url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabIds: {},
  bookmarks: [],
  recentlyClosed: [],

  createTab: (workspaceId, urlOrQuery) => {
    const url = urlOrQuery ? resolveAddressBarInput(urlOrQuery) : BROWSER_HOME_URL;
    const tab = newTab(workspaceId, url);
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabIds: { ...s.activeTabIds, [workspaceId]: tab.id },
    }));
    void window.sero.browser.openTab(tab.id, url, workspaceId);
    void window.sero.browser.setActive(tab.id, workspaceId);
    persistLayout({
      browserTabs: toPersistedTabs(get().tabs),
      activeBrowserTabIds: get().activeTabIds,
    });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabIds, recentlyClosed } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const closing = tabs[idx];
    const ws = closing.workspaceId;

    const nextTabs = tabs.filter((t) => t.id !== id);
    // Neighbour preference is scoped to the same workspace.
    const wsTabs = tabs.filter((t) => t.workspaceId === ws);
    const wsIdx = wsTabs.findIndex((t) => t.id === id);
    const nextWsTabs = wsTabs.filter((t) => t.id !== id);

    let nextActive: string | null = activeTabIds[ws] ?? null;
    if (nextActive === id) {
      const neighbour = nextWsTabs[wsIdx] ?? nextWsTabs[wsIdx - 1] ?? null;
      nextActive = neighbour ? neighbour.id : null;
    }

    const nextClosed = [
      {
        workspaceId: ws,
        url: closing.url,
        title: closing.title,
        favicon: closing.favicon,
        closedAt: Date.now(),
      },
      ...recentlyClosed,
    ].slice(0, MAX_RECENTLY_CLOSED);

    set({
      tabs: nextTabs,
      activeTabIds: { ...activeTabIds, [ws]: nextActive },
      recentlyClosed: nextClosed,
    });
    void window.sero.browser.closeTab(id, ws);
    void window.sero.browser.setActive(nextActive, ws);
    persistLayout({
      browserTabs: toPersistedTabs(nextTabs),
      activeBrowserTabIds: get().activeTabIds,
    });
  },

  closeOtherTabs: (id) => {
    const target = get().tabs.find((t) => t.id === id);
    if (!target) return;
    const ws = target.workspaceId;
    for (const t of get().tabs) {
      if (t.workspaceId === ws && t.id !== id) get().closeTab(t.id);
    }
  },

  closeAllTabs: (workspaceId) => {
    for (const t of get().tabs) {
      if (t.workspaceId === workspaceId) get().closeTab(t.id);
    }
  },

  reopenClosedTab: (workspaceId) => {
    const index = get().recentlyClosed.findIndex((t) => t.workspaceId === workspaceId);
    if (index === -1) return;
    const entry = get().recentlyClosed[index];
    set((s) => ({
      recentlyClosed: [...s.recentlyClosed.slice(0, index), ...s.recentlyClosed.slice(index + 1)],
    }));
    get().createTab(workspaceId, entry.url);
  },

  setActive: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (get().activeTabIds[tab.workspaceId] === id) return;
    set((s) => ({
      activeTabIds: { ...s.activeTabIds, [tab.workspaceId]: id },
    }));
    void window.sero.browser.setActive(id, tab.workspaceId);
    persistLayout({ activeBrowserTabIds: get().activeTabIds });
  },

  reorderTabs: (workspaceId, ids) => {
    const { tabs } = get();
    const byId = new Map(tabs.map((t) => [t.id, t]));

    // Split current tabs into "belongs to workspace" (reordered) and "other" (kept in place).
    const wsTabsInNewOrder: BrowserTab[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (t && t.workspaceId === workspaceId) wsTabsInNewOrder.push(t);
    }
    // Append any workspace tabs that got dropped (defensive).
    for (const t of tabs) {
      if (t.workspaceId === workspaceId && !ids.includes(t.id)) wsTabsInNewOrder.push(t);
    }

    // Rebuild the flat list, slotting reordered workspace tabs into the
    // positions of their siblings (so other workspaces' tabs keep their
    // relative order).
    const reordered: BrowserTab[] = [];
    let wsCursor = 0;
    for (const t of tabs) {
      if (t.workspaceId === workspaceId) {
        reordered.push(wsTabsInNewOrder[wsCursor++] ?? t);
      } else {
        reordered.push(t);
      }
    }
    set({ tabs: reordered });
    persistLayout({ browserTabs: toPersistedTabs(reordered) });
  },

  setActiveByIndex: (workspaceId, index) => {
    const wsTabs = get().tabs.filter((t) => t.workspaceId === workspaceId);
    const tab = wsTabs[index];
    if (tab) get().setActive(tab.id);
  },

  cycleActive: (workspaceId, delta) => {
    const wsTabs = get().tabs.filter((t) => t.workspaceId === workspaceId);
    if (wsTabs.length === 0) return;
    const activeId = get().activeTabIds[workspaceId] ?? null;
    const idx = wsTabs.findIndex((t) => t.id === activeId);
    const len = wsTabs.length;
    const next = idx < 0 ? 0 : ((idx + delta) % len + len) % len;
    get().setActive(wsTabs[next].id);
  },

  navigate: (id, urlOrQuery) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const url = resolveAddressBarInput(urlOrQuery);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, url, isLoading: true } : t)),
    }));
    void window.sero.browser.navigate(id, url, tab.workspaceId);
    persistLayout({ browserTabs: toPersistedTabs(get().tabs) });
  },

  goBack: (id) => {
    const ws = get().tabs.find((t) => t.id === id)?.workspaceId;
    if (ws) void window.sero.browser.goBack(id, ws);
  },
  goForward: (id) => {
    const ws = get().tabs.find((t) => t.id === id)?.workspaceId;
    if (ws) void window.sero.browser.goForward(id, ws);
  },
  reload: (id) => {
    const ws = get().tabs.find((t) => t.id === id)?.workspaceId;
    if (ws) void window.sero.browser.reload(id, ws);
  },
  stop: (id) => {
    const ws = get().tabs.find((t) => t.id === id)?.workspaceId;
    if (ws) void window.sero.browser.stop(id, ws);
  },

  sharePageWithChat: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const result = await window.sero.browser.extractPage(id, tab.workspaceId);
    if (!result) {
      console.warn('[browser] Page extraction returned nothing.');
      return;
    }
    const { title, url, text } = result;
    const heading = title.trim() ? `# ${title.trim()}\n\n` : '';
    // Trim very long page captures — the composer prefill path overwrites
    // the draft, and agent token budgets are finite. 12k chars ~= 3k tokens
    // and is enough to carry most articles' salient content.
    const MAX = 12000;
    const body = text.length > MAX ? `${text.slice(0, MAX)}\n\n[…truncated…]` : text;
    const attribution = `— ${url}`;
    prefillChatComposer(`${heading}${body}\n\n${attribution}\n\n`);
  },

  addBookmark: (input) => {
    const { bookmarks } = get();
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

  hydrate: ({ tabs, activeIds, legacyActiveId, bookmarks }) => {
    const hydratedTabs: BrowserTab[] = (tabs ?? []).map((t) => ({
      id: t.id,
      workspaceId: t.workspaceId ?? 'global',
      url: t.url,
      title: t.title ?? t.url,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    }));

    const resolvedActiveIds: Record<string, string | null> = {};
    if (activeIds) {
      for (const [ws, id] of Object.entries(activeIds)) {
        if (!id) continue;
        if (hydratedTabs.some((t) => t.id === id && t.workspaceId === ws)) {
          resolvedActiveIds[ws] = id;
        }
      }
    }
    // Backward compat: promote legacy single active id into its workspace bucket.
    if (legacyActiveId) {
      const tab = hydratedTabs.find((t) => t.id === legacyActiveId);
      if (tab && !resolvedActiveIds[tab.workspaceId]) {
        resolvedActiveIds[tab.workspaceId] = tab.id;
      }
    }

    // Backfill: every workspace with tabs should have an active tab.
    const workspaces = new Set(hydratedTabs.map((t) => t.workspaceId));
    for (const ws of workspaces) {
      if (!resolvedActiveIds[ws]) {
        const first = hydratedTabs.find((t) => t.workspaceId === ws);
        if (first) resolvedActiveIds[ws] = first.id;
      }
    }

    set({
      tabs: hydratedTabs,
      activeTabIds: resolvedActiveIds,
      bookmarks: bookmarks ?? [],
    });
  },

  ensureViewsOpen: (workspaceId) => {
    const { tabs, activeTabIds } = get();
    for (const tab of tabs) {
      if (tab.workspaceId !== workspaceId) continue;
      // openTab is idempotent — the manager navigates the existing view if
      // the tab already has one.
      void window.sero.browser.openTab(tab.id, tab.url, tab.workspaceId);
    }
    void window.sero.browser.setActive(activeTabIds[workspaceId] ?? null, workspaceId);
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
  },
}));

/* ── Selectors ──────────────────────────────────────────────── */

export function useWorkspaceBrowserTabs(workspaceId: string): BrowserTab[] {
  return useBrowserStore(
    useShallow((s) => s.tabs.filter((t) => t.workspaceId === workspaceId)),
  );
}

export function useActiveBrowserTabId(workspaceId: string): string | null {
  return useBrowserStore((s) => s.activeTabIds[workspaceId] ?? null);
}
