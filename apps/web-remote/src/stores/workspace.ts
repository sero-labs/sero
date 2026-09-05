/**
 * Workspace store — workspace list, the session tree, live session state.
 *
 * The sidebar shows every workspace the token can reach, each with its own
 * sessions, so sessions are held per workspace rather than as one flat list.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage, SessionState } from '@/lib/gateway-client';

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface Session {
  id: string;
  name: string;
  firstMessage?: string;
  workspaceId: string;
  /** ISO 8601, from the gateway. */
  updatedAt: string;
  messageCount: number;
}

/** What the last finished turn produced, for the session list. */
export interface SessionTurn {
  ts: number;
  outcome: 'completed' | 'cancelled' | 'error';
  snippet?: string;
}

/** Which surface the main area shows. */
export type WorkspaceView = 'board' | 'chat' | 'dashboard';

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  /** Sessions keyed by workspace id. */
  sessionsByWorkspace: Record<string, Session[]>;
  activeSessionId: string | null;
  /** Expanded workspace rows in the tree, keyed by workspace id. */
  expanded: Record<string, boolean>;
  /** Live state per session id, from `session_state` push events. */
  sessionStates: Record<string, SessionState>;
  /** Last finished turn per session id, from `turn_complete` push events. */
  lastTurns: Record<string, SessionTurn>;
  view: WorkspaceView;

  fetchWorkspaces: () => void;
  fetchSessions: (workspaceId: string) => void;
  setActiveWorkspace: (id: string) => void;
  toggleExpanded: (id: string) => void;
  setActiveSession: (id: string) => void;
  createSession: (workspaceId?: string, name?: string) => void;
  deleteSession: (workspaceId: string, sessionId: string) => void;
  setView: (view: WorkspaceView) => void;
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

/** The sessions in a `list_sessions` reply that belong to `workspaceId`. */
function readSessions(value: unknown, workspaceId: string): Session[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const session = item as Session;
    if (typeof session.id !== 'string') return [];
    // A reply is for one workspace. A session naming another one is a
    // host mistake, and filing it here would show it in the wrong tree.
    if (session.workspaceId && session.workspaceId !== workspaceId) return [];
    return [{ ...session, workspaceId }];
  });
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const getClient = () => useConnectionStore.getState().client;

  return {
    workspaces: [],
    activeWorkspaceId: null,
    sessionsByWorkspace: {},
    activeSessionId: null,
    expanded: {},
    sessionStates: {},
    lastTurns: {},
    view: 'board',

    fetchWorkspaces: () => {
      getClient().requestWorkspaces();
    },

    // The reply is correlated to this request, so it names its own
    // workspace whatever order replies arrive in, and an empty list
    // empties the right one. A failed fetch leaves the old list alone.
    fetchSessions: (workspaceId: string) => {
      getClient().requestSessions(workspaceId).then(
        (data) => {
          const sessions = readSessions(data, workspaceId);
          set((s) => ({ sessionsByWorkspace: { ...s.sessionsByWorkspace, [workspaceId]: sessions } }));
        },
        () => undefined,
      );
    },

    setActiveWorkspace: (id: string) => {
      set((s) => ({ activeWorkspaceId: id, expanded: { ...s.expanded, [id]: true } }));
      get().fetchSessions(id);
    },

    toggleExpanded: (id: string) => {
      const wasExpanded = get().expanded[id] ?? false;
      set((s) => ({ expanded: { ...s.expanded, [id]: !wasExpanded } }));
      if (!wasExpanded) get().fetchSessions(id);
    },

    setActiveSession: (id: string) => {
      set({ activeSessionId: id, view: 'chat' });
    },

    createSession: (workspaceId?: string, name?: string) => {
      const targetId = workspaceId ?? get().activeWorkspaceId;
      if (!targetId) return;
      set({ activeWorkspaceId: targetId, view: 'chat' });
      getClient().createSession(targetId, name);
    },

    // The row disappears only when the host confirms the delete, so a
    // refused delete leaves the session where it is.
    deleteSession: (workspaceId: string, sessionId: string) => {
      getClient().deleteSession(workspaceId, sessionId);
    },

    setView: (view: WorkspaceView) => {
      set({ view });
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

        // Load every workspace's sessions: the tree shows them all.
        for (const workspace of workspaces) {
          get().fetchSessions(workspace.id);
        }

        const { activeWorkspaceId } = get();
        if (!activeWorkspaceId && workspaces.length > 0) {
          set((s) => ({
            activeWorkspaceId: workspaces[0].id,
            expanded: { ...s.expanded, [workspaces[0].id]: true },
          }));
        }
      }

      if (response.requestType === 'delete_session') {
        const deletedId = readString((response.data as { sessionId?: unknown } | undefined)?.sessionId);
        if (!deletedId) return;
        // A session id is unique, so sweeping every workspace needs no
        // workspace id in the response.
        const remaining: Record<string, Session[]> = {};
        for (const [workspaceId, sessions] of Object.entries(get().sessionsByWorkspace)) {
          remaining[workspaceId] = sessions.filter((session) => session.id !== deletedId);
        }
        set((s) => ({
          sessionsByWorkspace: remaining,
          activeSessionId: s.activeSessionId === deletedId ? null : s.activeSessionId,
        }));
        return;
      }

      if (response.requestType === 'create_session') {
        const session = response.data as Session | undefined;
        if (!session) return;
        const workspaceId = session.workspaceId || get().activeWorkspaceId;
        if (!workspaceId) return;
        set((s) => ({
          sessionsByWorkspace: {
            ...s.sessionsByWorkspace,
            [workspaceId]: [session, ...(s.sessionsByWorkspace[workspaceId] ?? [])],
          },
          activeSessionId: session.id,
          activeWorkspaceId: workspaceId,
          expanded: { ...s.expanded, [workspaceId]: true },
          view: 'chat',
        }));
      }
    },
  };
});

/** Sessions of one workspace, newest first. */
export function selectSessions(state: WorkspaceStore, workspaceId: string): Session[] {
  return state.sessionsByWorkspace[workspaceId] ?? [];
}
