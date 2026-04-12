import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';

export function useActiveSessionSync(): void {
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const activeSession = useSessionStore((state) =>
    state.activeSessionId
      ? state.sessions.find((session) => session.id === state.activeSessionId) ?? null
      : null,
  );
  const activeAgentReady = useAgentStore((state) =>
    activeSessionId ? Boolean(state.agents[activeSessionId]?.sessionId) : false,
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

      if (!activeSession) return;

      try {
        if (activeAgentReady) {
          focusSession(activeSessionId);
        } else {
          await openSession(
            activeSessionId,
            activeSession.path,
            activeSession.workspaceId,
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
    activeSession,
    activeSessionId,
    clearFocus,
    focusSession,
    hydrateCollaborationState,
    openSession,
  ]);
}
