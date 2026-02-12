import { create } from 'zustand';
import type { SeroSessionInfo } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';

const ACTIVE_SESSION_KEY = 'sero:session:active';

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

  // ── Actions ────────────────────────────────────────────────
  loadSessions: () => Promise<void>;
  /** Create a session bound to a workspace. Defaults to scratchpad. */
  createSession: (workspaceId?: string) => Promise<SeroSessionInfo>;
  deleteSession: (sessionPath: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  /** Update a session's display name in-memory (e.g., from agent title generation). */
  updateSessionName: (sessionId: string, name: string) => void;
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
  activeSessionId: localStorage.getItem(ACTIVE_SESSION_KEY) || null,
  searchQuery: '',
  isLoading: false,
  error: null,

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
    if (clearActive) localStorage.removeItem(ACTIVE_SESSION_KEY);
    set({
      sessions: remaining,
      activeSessionId: clearActive ? null : activeSessionId,
    });
  },

  setActiveSession: (id) => {
    if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
    set({ activeSessionId: id });
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
}));

// ── Selectors ──────────────────────────────────────────────────

/** Sessions filtered by search query. */
export function useFilteredSessions(): SeroSessionInfo[] {
  const sessions = useSessionStore((s) => s.sessions);
  const query = useSessionStore((s) => s.searchQuery);

  if (!query) return sessions;

  const lower = query.toLowerCase();
  return sessions.filter(
    (s) =>
      (s.name?.toLowerCase().includes(lower) ?? false) ||
      s.firstMessage.toLowerCase().includes(lower),
  );
}

/** Sessions grouped by workspace ID. */
export function useSessionsByWorkspace(): Record<string, SeroSessionInfo[]> {
  const sessions = useSessionStore((s) => s.sessions);
  const query = useSessionStore((s) => s.searchQuery);

  const filtered = query
    ? sessions.filter(
        (s) =>
          (s.name?.toLowerCase().includes(query.toLowerCase()) ?? false) ||
          s.firstMessage.toLowerCase().includes(query.toLowerCase()),
      )
    : sessions;

  const grouped: Record<string, SeroSessionInfo[]> = {};
  for (const session of filtered) {
    const wsId = session.workspaceId;
    if (!grouped[wsId]) grouped[wsId] = [];
    grouped[wsId].push(session);
  }

  return grouped;
}
