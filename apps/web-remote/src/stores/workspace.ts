/**
 * Workspace store — workspace list, active workspace, session management.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage, SessionState } from '@/lib/gateway-client';

interface Workspace {
  id: string;
  name: string;
  path: string;
}

interface Session {
  id: string;
  name: string;
  firstMessage?: string;
}

/** What the last finished turn produced, for the session list. */
interface SessionTurn {
  ts: number;
  outcome: 'completed' | 'cancelled' | 'error';
  snippet?: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  sessions: Session[];
  activeSessionId: string | null;
  /** Live state per session id, from `session_state` push events. */
  sessionStates: Record<string, SessionState>;
  /** Last finished turn per session id, from `turn_complete` push events. */
  lastTurns: Record<string, SessionTurn>;

  fetchWorkspaces: () => void;
  fetchSessions: (workspaceId: string) => void;
  setActiveWorkspace: (id: string) => void;
  setActiveSession: (id: string) => void;
  createSession: (name?: string) => void;
  handleMessage: (msg: GatewayMessage) => void;
}

// ── Push-event field readers ────────────────────────────────
// Push events cross a WebSocket, so their fields are unknown until
// checked. These keep the store free of blind casts.

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isSessionState(value: unknown): value is SessionState {
  return value === 'running' || value === 'idle' || value === 'awaiting_input';
}

function isTurnOutcome(value: unknown): value is SessionTurn['outcome'] {
  return value === 'completed' || value === 'cancelled' || value === 'error';
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const getClient = () => useConnectionStore.getState().client;

  return {
    workspaces: [],
    activeWorkspaceId: null,
    sessions: [],
    activeSessionId: null,
    sessionStates: {},
    lastTurns: {},

    fetchWorkspaces: () => {
      getClient().requestWorkspaces();
    },

    fetchSessions: (workspaceId: string) => {
      getClient().requestSessions(workspaceId);
    },

    setActiveWorkspace: (id: string) => {
      set({ activeWorkspaceId: id, sessions: [], activeSessionId: null });
      get().fetchSessions(id);
    },

    setActiveSession: (id: string) => {
      set({ activeSessionId: id });
    },

    createSession: (name?: string) => {
      const { activeWorkspaceId } = get();
      if (!activeWorkspaceId) return;
      getClient().createSession(activeWorkspaceId, name);
    },

    handleMessage: (msg: GatewayMessage) => {
      // Workspace-scoped push events arrive for every session the token
      // can reach, not only the one on screen.
      if (msg.type === 'session_state') {
        const sessionId = readString(msg.sessionId);
        if (!sessionId || !isSessionState(msg.state)) return;
        const state = msg.state;
        set((s) => ({ sessionStates: { ...s.sessionStates, [sessionId]: state } }));
        return;
      }

      if (msg.type === 'turn_complete') {
        const sessionId = readString(msg.sessionId);
        if (!sessionId) return;
        const turn: SessionTurn = {
          ts: typeof msg.ts === 'number' ? msg.ts : Date.now(),
          outcome: isTurnOutcome(msg.outcome) ? msg.outcome : 'completed',
          snippet: readString(msg.snippet),
        };
        set((s) => ({ lastTurns: { ...s.lastTurns, [sessionId]: turn } }));
        return;
      }

      if (msg.type !== 'ok' || !('requestType' in msg)) return;

      const response = msg as { type: 'ok'; requestType: string; data?: unknown };

      if (response.requestType === 'list_workspaces') {
        const workspaces = (response.data as Workspace[]) ?? [];
        set({ workspaces });

        // Auto-select first workspace if none selected
        const { activeWorkspaceId } = get();
        if (!activeWorkspaceId && workspaces.length > 0) {
          get().setActiveWorkspace(workspaces[0].id);
        }
      }

      if (response.requestType === 'list_sessions') {
        const sessions = (response.data as Session[]) ?? [];
        set({ sessions });
      }

      if (response.requestType === 'create_session') {
        const session = response.data as Session;
        if (session) {
          set((s) => ({
            sessions: [...s.sessions, session],
            activeSessionId: session.id,
          }));
        }
      }
    },
  };
});
