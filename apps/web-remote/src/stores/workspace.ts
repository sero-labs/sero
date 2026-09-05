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
  /**
   * Workspace ids of `list_sessions` requests still awaiting a response,
   * in request order. The response carries a workspace id on each session,
   * but an empty list carries none — this says which workspace it emptied.
   * One ordered socket makes first-in-first-out correct.
   */
  pendingSessionFetches: string[];

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

/** Group a `list_sessions` response by the workspace each session names. */
function groupByWorkspace(sessions: Session[]): Record<string, Session[]> {
  const grouped: Record<string, Session[]> = {};
  for (const session of sessions) {
    if (!session.workspaceId) continue;
    (grouped[session.workspaceId] ??= []).push(session);
  }
  return grouped;
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
    pendingSessionFetches: [],

    fetchWorkspaces: () => {
      // A fresh listing restarts the session-fetch queue. A dropped
      // response across a reconnect would otherwise shift it out of step.
      set({ pendingSessionFetches: [] });
      getClient().requestWorkspaces();
    },

    fetchSessions: (workspaceId: string) => {
      set((s) => ({ pendingSessionFetches: [...s.pendingSessionFetches, workspaceId] }));
      getClient().requestSessions(workspaceId);
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

      if (response.requestType === 'list_sessions') {
        const sessions = (response.data as Session[]) ?? [];
        const [requestedWorkspaceId, ...rest] = get().pendingSessionFetches;
        const grouped = groupByWorkspace(sessions);
        // An empty response names no workspace, so fall back to the
        // workspace this response answers.
        if (requestedWorkspaceId && !(requestedWorkspaceId in grouped)) {
          grouped[requestedWorkspaceId] = [];
        }
        set((s) => ({
          sessionsByWorkspace: { ...s.sessionsByWorkspace, ...grouped },
          pendingSessionFetches: rest,
        }));
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
