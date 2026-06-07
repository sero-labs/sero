import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app';
import { useAgentStore } from '@/stores/agent';
import { useOpenWorkspaces, useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore, useSessionsByWorkspace } from '@/stores/sessions';
import { toErrorMessage } from '../../error-utils';

interface OpenSessionEventDetail {
  sessionId: string | null;
  sessionPath: string | null;
  workspaceId: string;
}

function refreshWorkspaceTree(loadWorkspaces: () => Promise<void>, loadSessions: () => Promise<void>) {
  void loadWorkspaces();
  void loadSessions();
}

export function useWorkspaceTreeRuntime() {
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const openWorkspaces = useOpenWorkspaces();
  const sessionsByWorkspace = useSessionsByWorkspace();
  const isLoadingWorkspaces = useWorkspaceStore((state) => state.isLoading);
  const workspacesReady = useWorkspaceStore((state) => state.workspacesReady);
  const clearSelection = useSessionStore((state) => state.clearSelection);
  const hasSelection = useSessionStore((state) => state.selectedSessionIds.size > 0);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);
  const openSession = useAgentStore((state) => state.openSession);
  const [openSessionError, setOpenSessionError] = useState<string | null>(null);

  useEffect(() => {
    refreshWorkspaceTree(loadWorkspaces, loadSessions);
  }, [loadSessions, loadWorkspaces]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && hasSelection && !event.defaultPrevented) {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, hasSelection]);

  useEffect(() => {
    const handleWorkspaceChanged = () => {
      refreshWorkspaceTree(loadWorkspaces, loadSessions);
    };

    window.addEventListener('sero:workspace-changed', handleWorkspaceChanged);
    return () => window.removeEventListener('sero:workspace-changed', handleWorkspaceChanged);
  }, [loadSessions, loadWorkspaces]);

  useEffect(() => {
    const handleOpenSession = async (event: Event) => {
      const { sessionId, sessionPath, workspaceId } = (event as CustomEvent<OpenSessionEventDetail>).detail;

      try {
        await window.sero.workspace.open(workspaceId);
        setOpenSessionError(null);
      } catch (error) {
        setOpenSessionError(
          toErrorMessage(error, 'Sero could not open the requested workspace.'),
        );
      }

      if (sessionId && sessionPath) {
        const runtimeBackend = useWorkspaceStore
          .getState()
          .workspaces.find((workspace) => workspace.id === workspaceId)
          ?.runtime.backend;
        await openSession(sessionId, sessionPath, workspaceId, runtimeBackend);
        setActiveSession(sessionId);
      }

      setChatPanelOpen(true);
    };

    window.addEventListener('sero:open-session', handleOpenSession);
    return () => window.removeEventListener('sero:open-session', handleOpenSession);
  }, [openSession, setActiveSession, setChatPanelOpen]);

  return {
    isLoadingWorkspaces,
    workspacesReady,
    openWorkspaces,
    sessionsByWorkspace,
    openSessionError,
    clearOpenSessionError: () => setOpenSessionError(null),
  };
}
