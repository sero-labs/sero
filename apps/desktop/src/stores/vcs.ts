import { create } from 'zustand';

import type {
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  ChangeEntry,
  WorkingCopyStatus,
  Bookmark,
  Remote,
  FileDiffEntry,
} from '@/types/vcs';

// ── Per-workspace VCS data ───────────────────────────────────

interface WorkspaceVcsData extends VcsWorkspaceState {
  // Rich state
  logEntries: ChangeEntry[];
  wcStatus: WorkingCopyStatus | null;
  bookmarks: Bookmark[];
  activePushBookmark: string | null;
  /** True once the user (or initial load) has set activePushBookmark. */
  activePushBookmarkInitialized: boolean;
  remotes: Remote[];
  // Diff state
  lastDiff: string | null;
  lastDiffFiles: FileDiffEntry[];
  // UI
  isLoading: boolean;
  error: string | null;
  logPage: number;
  logHasMore: boolean;
}

interface VcsStore {
  byWorkspace: Record<string, WorkspaceVcsData>;
  listening: boolean;

  // Lifecycle
  initEventListener: () => () => void;

  // Data loading
  loadWorkspace: (wsId: string) => Promise<void>;
  loadLog: (wsId: string, page?: number) => Promise<void>;
  loadMoreLog: (wsId: string) => Promise<void>;
  loadStatus: (wsId: string) => Promise<void>;
  loadBookmarks: (wsId: string) => Promise<void>;
  loadRemotes: (wsId: string) => Promise<void>;
  refreshAll: (wsId: string) => Promise<void>;

  // Watcher
  watchWorkspace: (wsId: string) => Promise<void>;
  unwatchWorkspace: (wsId: string) => Promise<void>;

  // Mutations
  createCheckpoint: (wsId: string, desc?: string, src?: VcsCheckpoint['source']) => Promise<void>;
  restoreCheckpoint: (wsId: string, id: string) => Promise<void>;
  describe: (wsId: string, changeId: string, msg: string) => Promise<void>;
  createBookmark: (wsId: string, name: string, rev?: string) => Promise<void>;
  deleteBookmark: (wsId: string, name: string) => Promise<void>;
  moveBookmark: (wsId: string, name: string, toRev: string) => Promise<void>;
  setActivePushBookmark: (wsId: string, name: string | null) => void;
  addRemote: (wsId: string, name: string, url: string) => Promise<void>;
  removeRemote: (wsId: string, name: string) => Promise<void>;
  fetch: (wsId: string, remote?: string) => Promise<{ success: boolean; message: string }>;
  push: (wsId: string, bm?: string, cId?: string) => Promise<{ success: boolean; message: string }>;
  undo: (wsId: string) => Promise<void>;
  abandon: (wsId: string, changeId: string) => Promise<void>;

  // Diff
  fetchDiff: (wsId: string, from: string, to?: string) => Promise<string>;
  fetchDiffFiles: (wsId: string, from: string, to?: string) => Promise<FileDiffEntry[]>;

  // Errors
  setError: (wsId: string, error: string | null) => void;
}

const PAGE_SIZE = 40;

function emptyWs(wsId: string): WorkspaceVcsData {
  return {
    workspaceId: wsId,
    currentChangeId: null,
    hasWorkingCopyChanges: false,
    checkpoints: [],
    logEntries: [],
    wcStatus: null,
    bookmarks: [],
    activePushBookmark: null,
    activePushBookmarkInitialized: false,
    remotes: [],
    lastDiff: null,
    lastDiffFiles: [],
    isLoading: false,
    error: null,
    logPage: 0,
    logHasMore: true,
  };
}

function getWs(state: Pick<VcsStore, 'byWorkspace'>, wsId: string): WorkspaceVcsData {
  return state.byWorkspace[wsId] ?? emptyWs(wsId);
}

function updateWs(
  set: (fn: (s: VcsStore) => Partial<VcsStore>) => void,
  wsId: string,
  patch: Partial<WorkspaceVcsData>,
): void {
  set((s) => {
    const existing = getWs(s, wsId);
    return { byWorkspace: { ...s.byWorkspace, [wsId]: { ...existing, ...patch } } };
  });
}

export const useVcsStore = create<VcsStore>((set, get) => ({
  byWorkspace: {},
  listening: false,

  initEventListener: () => {
    if (get().listening) return () => {};
    set({ listening: true });

    const unsub = window.sero.vcs.onEvent((event: VcsEvent) => {
      const wsId = event.workspaceId;
      switch (event.type) {
        case 'checkpoint_created': {
          const ws = getWs(get(), wsId);
          const cps = [event.checkpoint, ...ws.checkpoints]
            .filter((cp, i, arr) => arr.findIndex((x) => x.changeId === cp.changeId) === i)
            .slice(0, 80);
          updateWs(set, wsId, { checkpoints: cps, hasWorkingCopyChanges: false, error: null });
          // Refresh log + status in background
          void get().loadLog(wsId);
          void get().loadStatus(wsId);
          break;
        }
        case 'restored':
          void get().refreshAll(wsId);
          break;
        case 'refreshed':
          void get().refreshAll(wsId);
          break;
        case 'error':
          updateWs(set, wsId, { error: event.error });
          break;
      }
    });

    return () => { unsub(); set({ listening: false }); };
  },

  loadWorkspace: async (wsId) => {
    updateWs(set, wsId, { isLoading: true, error: null });
    try {
      const state = await window.sero.vcs.getState(wsId, 60);
      updateWs(set, wsId, { ...state, isLoading: false, error: null });
    } catch (err) {
      updateWs(set, wsId, { isLoading: false, error: errMsg(err) });
    }
  },

  loadLog: async (wsId, page = 0) => {
    try {
      const limit = PAGE_SIZE;
      const entries = await window.sero.vcs.logEntries(wsId, limit);
      updateWs(set, wsId, {
        logEntries: entries,
        logPage: 0,
        logHasMore: entries.length >= limit,
        error: null,
      });
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
    }
  },

  loadMoreLog: async (wsId) => {
    const ws = getWs(get(), wsId);
    try {
      const nextLimit = (ws.logPage + 2) * PAGE_SIZE;
      const entries = await window.sero.vcs.logEntries(wsId, nextLimit);
      updateWs(set, wsId, {
        logEntries: entries,
        logPage: ws.logPage + 1,
        logHasMore: entries.length >= nextLimit,
      });
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
    }
  },

  loadStatus: async (wsId) => {
    try {
      const status = await window.sero.vcs.status(wsId);
      updateWs(set, wsId, { wcStatus: status });
    } catch (err) {
      console.debug('[vcs] Failed to load status (may not have JJ repo yet):', err);
    }
  },

  loadBookmarks: async (wsId) => {
    try {
      const bookmarks = await window.sero.vcs.bookmarks(wsId);
      const ws = getWs(get(), wsId);
      let activePushBookmark = ws.activePushBookmark;

      // Clear if the selected bookmark was deleted
      if (activePushBookmark && !bookmarks.some((b) => b.name === activePushBookmark)) {
        activePushBookmark = null;
      }

      // Only auto-select on first initialization, not on every reload
      // (otherwise the user's explicit "auto" choice gets overwritten)
      if (!ws.activePushBookmarkInitialized && activePushBookmark === null && bookmarks.length > 0) {
        activePushBookmark = bookmarks.find((b) => b.name === 'main')?.name ?? bookmarks[0]?.name ?? null;
      }

      updateWs(set, wsId, {
        bookmarks,
        activePushBookmark,
        activePushBookmarkInitialized: ws.activePushBookmarkInitialized || bookmarks.length > 0,
      });
    } catch (err) {
      console.warn('[vcs] Failed to load bookmarks:', err);
    }
  },

  loadRemotes: async (wsId) => {
    try {
      const remotes = await window.sero.vcs.remotes(wsId);
      updateWs(set, wsId, { remotes });
    } catch (err) {
      console.warn('[vcs] Failed to load remotes:', err);
    }
  },

  refreshAll: async (wsId) => {
    await Promise.all([
      get().loadWorkspace(wsId),
      get().loadLog(wsId),
      get().loadStatus(wsId),
      get().loadBookmarks(wsId),
      get().loadRemotes(wsId),
    ]);
  },

  watchWorkspace: async (wsId) => { await window.sero.vcs.watch(wsId); },
  unwatchWorkspace: async (wsId) => { await window.sero.vcs.unwatch(wsId); },

  createCheckpoint: async (wsId, desc, src = 'manual') => {
    try {
      await window.sero.vcs.createCheckpoint(wsId, desc, src);
      await get().refreshAll(wsId);
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
    }
  },

  restoreCheckpoint: async (wsId, id) => {
    try {
      await window.sero.vcs.restore(wsId, id);
      await get().refreshAll(wsId);
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
      throw err;
    }
  },

  describe: async (wsId, changeId, msg) => {
    await window.sero.vcs.describe(wsId, changeId, msg);
    await get().loadLog(wsId);
  },

  createBookmark: async (wsId, name, rev) => {
    await window.sero.vcs.createBookmark(wsId, name, rev);
    await get().loadBookmarks(wsId);
    await get().loadLog(wsId);
  },

  deleteBookmark: async (wsId, name) => {
    await window.sero.vcs.deleteBookmark(wsId, name);
    await get().loadBookmarks(wsId);
    await get().loadLog(wsId);
  },

  moveBookmark: async (wsId, name, toRev) => {
    await window.sero.vcs.moveBookmark(wsId, name, toRev);
    await get().loadBookmarks(wsId);
    await get().loadLog(wsId);
  },

  setActivePushBookmark: (wsId, name) => {
    const ws = getWs(get(), wsId);
    if (name && !ws.bookmarks.some((b) => b.name === name)) return;
    updateWs(set, wsId, { activePushBookmark: name, activePushBookmarkInitialized: true });
  },

  addRemote: async (wsId, name, url) => {
    await window.sero.vcs.addRemote(wsId, name, url);
    await get().loadRemotes(wsId);
  },

  removeRemote: async (wsId, name) => {
    await window.sero.vcs.removeRemote(wsId, name);
    await get().loadRemotes(wsId);
  },

  fetch: async (wsId, remote) => {
    const result = await window.sero.vcs.fetch(wsId, remote);
    await get().refreshAll(wsId);
    return result;
  },

  push: async (wsId, bm, cId) => {
    const result = await window.sero.vcs.push(wsId, bm, cId);
    updateWs(set, wsId, { error: result.success ? null : result.message });
    await get().loadBookmarks(wsId);
    return result;
  },

  undo: async (wsId) => {
    await window.sero.vcs.undo(wsId);
    await get().refreshAll(wsId);
  },

  abandon: async (wsId, changeId) => {
    await window.sero.vcs.abandon(wsId, changeId);
    await get().refreshAll(wsId);
  },

  fetchDiff: async (wsId, from, to) => {
    const diff = await window.sero.vcs.diff(wsId, from, to);
    updateWs(set, wsId, { lastDiff: diff, error: null });
    return diff;
  },

  fetchDiffFiles: async (wsId, from, to) => {
    const files = await window.sero.vcs.fileDiffSummary(wsId, from, to);
    updateWs(set, wsId, { lastDiffFiles: files });
    return files;
  },

  setError: (wsId, error) => updateWs(set, wsId, { error }),
}));

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown VCS error';
}

export function useWorkspaceVcs(wsId: string | null | undefined): WorkspaceVcsData | null {
  return useVcsStore((s) => (wsId ? s.byWorkspace[wsId] ?? null : null));
}
