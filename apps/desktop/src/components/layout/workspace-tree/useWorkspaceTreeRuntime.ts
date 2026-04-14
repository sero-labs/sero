import { useEffect } from 'react';
import { useAppStore } from '@/stores/app';
import { useAgentStore } from '@/stores/agent';
import { useOpenWorkspaces, useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore, useSessionsByWorkspace } from '@/stores/sessions';

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
  const clearSelection = useSessionStore((state) => state.clearSelection);
  const hasSelection = useSessionStore((state) => state.selectedSessionIds.size > 0);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);
  const openSession = useAgentStore((state) => state.openSession);

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

      await window.sero.workspace.open(workspaceId).catch(() => {});

      if (sessionId && sessionPath) {
        await openSession(sessionId, sessionPath, workspaceId);
        setActiveSession(sessionId);
      }

      setChatPanelOpen(true);
    };

    window.addEventListener('sero:open-session', handleOpenSession);
    return () => window.removeEventListener('sero:open-session', handleOpenSession);
  }, [openSession, setActiveSession, setChatPanelOpen]);

  return {
    isLoadingWorkspaces,
    openWorkspaces,
    sessionsByWorkspace,
  };
}
