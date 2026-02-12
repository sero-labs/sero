import { create } from 'zustand';
import type { SeroSessionInfo } from '@/types/ipc';

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
  createSession: () => Promise<SeroSessionInfo>;
  deleteSession: (sessionPath: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
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

  createSession: async () => {
    const session = await window.sero.sessions.create();
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
    set({
      sessions: remaining,
      // Clear active if we just deleted it
      activeSessionId:
        target && activeSessionId === target.id ? null : activeSessionId,
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),
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
