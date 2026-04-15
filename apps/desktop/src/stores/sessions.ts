import { create } from 'zustand';
import type { SeroSessionInfo } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { persistLayout } from '@/lib/persist-layout';

// ── Types ──────────────────────────────────────────────────────

interface SessionsState {
  /** All known sessions, sorted most-recent first. */
  sessions: SeroSessionInfo[];
  /** Currently selected session ID (drives ChatPanel). */
  activeSessionId: string | null;
  /** Search/filter query for the sidebar list. */
  searchQuery: string;
  /** True while sessions are being loaded from disk. */
  isLoading: boolean;
  /** Last error message, if any. */
  error: string | null;

  // ── Multi-select ───────────────────────────────────────────
  /** Session IDs currently selected for bulk actions (Ctrl/Cmd+click, Shift+click). */
  selectedSessionIds: Set<string>;
  /** The last session ID that was clicked — anchor for Shift+click range selection. */
  lastClickedSessionId: string | null;

  // ── Actions ────────────────────────────────────────────────
  loadSessions: () => Promise<void>;
  /** Create a session bound to a workspace. Defaults to global. */
  createSession: (workspaceId?: string) => Promise<SeroSessionInfo>;
  deleteSession: (sessionPath: string) => Promise<void>;
  /** Bulk-delete selected sessions in a workspace. Returns count of deleted sessions. */
  deleteSelectedSessions: (workspaceId: string) => Promise<number>;
  setActiveSession: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  /** Update a session's display name in-memory (e.g., from agent title generation). */
  updateSessionName: (sessionId: string, name: string) => void;
  /** Rename a session via IPC (persists to session file). */
  renameSession: (sessionId: string, name: string) => Promise<void>;
  /** Toggle a single session in/out of the multi-select set. */
  toggleSelectSession: (sessionId: string) => void;
  /** Select a contiguous range of sessions (Shift+click). Uses `lastClickedSessionId` as anchor. */
  selectSessionRange: (sessionId: string, workspaceSessions: SeroSessionInfo[]) => void;
  /** Clear all multi-select state. */
  clearSelection: () => void;
}

/** Sort sessions by modified date, newest first. */
function sortByModified(sessions: SeroSessionInfo[]): SeroSessionInfo[] {
  return [...sessions].sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
  );
}

// ── Store ──────────────────────────────────────────────────────

export const useSessionStore = create<SessionsState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  searchQuery: '',
  isLoading: false,
  error: null,
  selectedSessionIds: new Set<string>(),
  lastClickedSessionId: null,

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await window.sero.sessions.list();
      
      set({ sessions: sortByModified(sessions), isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      console.error('[sessions] loadSessions failed:', err);
      set({ error: message, isLoading: false });
    }
  },

  createSession: async (workspaceId?: string) => {
    const session = await window.sero.sessions.create(workspaceId);
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
    }));
    return session;
  },

  deleteSession: async (sessionPath: string) => {
    const { sessions, activeSessionId } = get();
    const target = sessions.find((s) => s.path === sessionPath);
    await window.sero.sessions.delete(sessionPath);
    const remaining = sessions.filter((s) => s.path !== sessionPath);
    const clearActive = target && activeSessionId === target.id;
    if (clearActive) persistLayout({ activeSessionId: null });
    set({
      sessions: remaining,
      activeSessionId: clearActive ? null : activeSessionId,
    });
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
    persistLayout({ activeSessionId: id });
    // Also activate the parent workspace so the title bar updates
    if (id) {
      const session = get().sessions.find((s) => s.id === id);
      if (session) {
        useWorkspaceStore.getState().setActiveWorkspace(session.workspaceId);
      }
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  updateSessionName: (sessionId, name) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, name } : sess,
      ),
    }));
  },

  renameSession: async (sessionId, name) => {
    await window.sero.sessions.rename(sessionId, name);
    // Also update in-memory immediately for snappy UI
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, name } : sess,
      ),
    }));
  },

  // ── Multi-select actions ─────────────────────────────────

  toggleSelectSession: (sessionId) => {
    const { selectedSessionIds } = get();
    const next = new Set(selectedSessionIds);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    set({ selectedSessionIds: next, lastClickedSessionId: sessionId });
  },

  selectSessionRange: (sessionId, workspaceSessions) => {
    const { lastClickedSessionId, selectedSessionIds } = get();
    if (!lastClickedSessionId) {
      // No anchor — just select this one
      set({
        selectedSessionIds: new Set([sessionId]),
        lastClickedSessionId: sessionId,
      });
      return;
    }

    const anchorIdx = workspaceSessions.findIndex((s) => s.id === lastClickedSessionId);
    const targetIdx = workspaceSessions.findIndex((s) => s.id === sessionId);
    if (anchorIdx === -1 || targetIdx === -1) {
      // Anchor is in a different workspace — start fresh
      set({
        selectedSessionIds: new Set([sessionId]),
        lastClickedSessionId: sessionId,
      });
      return;
    }

    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const rangeIds = workspaceSessions.slice(start, end + 1).map((s) => s.id);

    // Merge with existing selection (add range on top)
    const next = new Set(selectedSessionIds);
    for (const id of rangeIds) next.add(id);

    set({ selectedSessionIds: next });
    // Keep lastClickedSessionId as the anchor — don't update it on shift+click
  },

  clearSelection: () => {
    set({ selectedSessionIds: new Set<string>(), lastClickedSessionId: null });
  },

  deleteSelectedSessions: async (workspaceId) => {
    const { selectedSessionIds, sessions, activeSessionId } = get();
    if (selectedSessionIds.size === 0) return 0;

    // Only delete selected sessions that belong to the target workspace
    const toDelete = sessions.filter(
      (s) => selectedSessionIds.has(s.id) && s.workspaceId === workspaceId,
    );
    if (toDelete.length === 0) return 0;

    // Use allSettled so partial failures don't leave inconsistent state
    const results = await Promise.allSettled(
      toDelete.map((s) => window.sero.sessions.delete(s.path)),
    );

    const deletedIds = new Set<string>();
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        deletedIds.add(toDelete[i].id);
      } else {
        console.error('[sessions] failed to delete session:', toDelete[i].id, results[i]);
      }
    }

    if (deletedIds.size === 0) return 0;

    const remaining = sessions.filter((s) => !deletedIds.has(s.id));
    const clearActive = activeSessionId != null && deletedIds.has(activeSessionId);
    if (clearActive) persistLayout({ activeSessionId: null });

    // Remove deleted IDs from selection; keep selections in other workspaces
    const nextSelected = new Set(selectedSessionIds);
    for (const id of deletedIds) nextSelected.delete(id);

    set({
      sessions: remaining,
      activeSessionId: clearActive ? null : activeSessionId,
      selectedSessionIds: nextSelected,
      lastClickedSessionId:
        nextSelected.size === 0 ? null : get().lastClickedSessionId,
    });

    return deletedIds.size;
  },
}));

// ── Selectors ──────────────────────────────────────────────────

const EMPTY_SESSIONS_BY_WORKSPACE: Record<string, SeroSessionInfo[]> = {};

let groupedSessionsCacheRef: SeroSessionInfo[] | null = null;
let groupedSessionsCacheQuery = '';
let groupedSessionsCacheValue: Record<string, SeroSessionInfo[]> = EMPTY_SESSIONS_BY_WORKSPACE;

function matchesSessionSearchQuery(session: SeroSessionInfo, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true;
  return (
    (session.name?.toLowerCase().includes(normalizedQuery) ?? false) ||
    session.firstMessage.toLowerCase().includes(normalizedQuery)
  );
}

function buildSessionsByWorkspace(
  sessions: SeroSessionInfo[],
  normalizedQuery: string,
): Record<string, SeroSessionInfo[]> {
  if (sessions.length === 0) {
    return EMPTY_SESSIONS_BY_WORKSPACE;
  }

  const grouped: Record<string, SeroSessionInfo[]> = {};
  let hasSessions = false;

  for (const session of sessions) {
    if (!matchesSessionSearchQuery(session, normalizedQuery)) {
      continue;
    }

    const workspaceId = session.workspaceId;
    if (!grouped[workspaceId]) {
      grouped[workspaceId] = [];
    }

    grouped[workspaceId].push(session);
    hasSessions = true;
  }

  return hasSessions ? grouped : EMPTY_SESSIONS_BY_WORKSPACE;
}

function selectSessionsByWorkspace(
  state: Pick<SessionsState, 'sessions' | 'searchQuery'>,
): Record<string, SeroSessionInfo[]> {
  const normalizedQuery = state.searchQuery.toLowerCase();
  if (
    groupedSessionsCacheRef === state.sessions &&
    groupedSessionsCacheQuery === normalizedQuery
  ) {
    return groupedSessionsCacheValue;
  }

  groupedSessionsCacheRef = state.sessions;
  groupedSessionsCacheQuery = normalizedQuery;
  groupedSessionsCacheValue = buildSessionsByWorkspace(state.sessions, normalizedQuery);
  return groupedSessionsCacheValue;
}

/** Sessions grouped by workspace ID. */
export function useSessionsByWorkspace(): Record<string, SeroSessionInfo[]> {
  return useSessionStore(selectSessionsByWorkspace);
}
