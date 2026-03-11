/**
 * Workspace store — workspace list, active workspace, session management.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage } from '@/lib/gateway-client';

interface Workspace {
  id: string;
  name: string;
  path: string;
}

interface Session {
  id: string;
  name: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  sessions: Session[];
  activeSessionId: string | null;

  fetchWorkspaces: () => void;
  fetchSessions: (workspaceId: string) => void;
  setActiveWorkspace: (id: string) => void;
  setActiveSession: (id: string) => void;
  createSession: (name?: string) => void;
  handleMessage: (msg: GatewayMessage) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const getClient = () => useConnectionStore.getState().client;

  return {
    workspaces: [],
    activeWorkspaceId: null,
    sessions: [],
    activeSessionId: null,

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
