import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';

export function useActiveSessionSync(): void {
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const activeSessionPath = useSessionStore((state) =>
    state.activeSessionId
      ? state.sessions.find((session) => session.id === state.activeSessionId)?.path ?? null
      : null,
  );
  const activeWorkspaceId = useSessionStore((state) =>
    state.activeSessionId
      ? state.sessions.find((session) => session.id === state.activeSessionId)?.workspaceId ?? null
      : null,
  );
  const activeWorkspaceBackend = useWorkspaceStore((state) =>
    activeWorkspaceId
      ? state.workspaces.find((workspace) => workspace.id === activeWorkspaceId)
          ?.runtime.backend
      : undefined,
  );
  const activeAgentReady = useAgentStore((state) =>
    activeSessionId
      ? Boolean(state.agents[activeSessionId]?.sessionId)
        && (!activeWorkspaceBackend || state.agents[activeSessionId]?.runtimeBackend === activeWorkspaceBackend)
      : false,
  );
  const openSession = useAgentStore((state) => state.openSession);
  const focusSession = useAgentStore((state) => state.focusSession);
  const clearFocus = useAgentStore((state) => state.clearFocus);
  const hydrateCollaborationState = useAgentStore(
    (state) => state.hydrateCollaborationState,
  );

  useEffect(() => {
    let cancelled = false;

    async function syncActiveSession() {
      if (!activeSessionId) {
        clearFocus();
        return;
      }

      if (!activeSessionPath || !activeWorkspaceId) return;

      try {
        if (activeAgentReady) {
          focusSession(activeSessionId);
        } else {
          await openSession(
            activeSessionId,
            activeSessionPath,
            activeWorkspaceId,
            activeWorkspaceBackend,
          );
        }

        const snapshot = await window.sero.collaboration.getState(activeSessionId);
        if (cancelled) return;
        hydrateCollaborationState(activeSessionId, snapshot);
      } catch (err) {
        console.error('[useSessionAgent] failed to sync active session:', err);
      }
    }

    void syncActiveSession();

    return () => {
      cancelled = true;
    };
  }, [
    activeAgentReady,
    activeSessionId,
    activeSessionPath,
    activeWorkspaceId,
    activeWorkspaceBackend,
    clearFocus,
    focusSession,
    hydrateCollaborationState,
    openSession,
  ]);
}
