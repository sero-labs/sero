import { useEffect } from 'react';
import { useContainerStore } from '@/stores/container';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';

export function useContainerEnsureOnSessionFocus(): void {
  const activeSession = useSessionStore((state) =>
    state.activeSessionId
      ? state.sessions.find((session) => session.id === state.activeSessionId) ?? null
      : null,
  );
  const activeWorkspaceContainerEnabled = useWorkspaceStore((state) =>
    activeSession
      ? state.workspaces.find((workspace) => workspace.id === activeSession.workspaceId)
          ?.container ?? false
      : false,
  );
  const containerStatus = useContainerStore((state) =>
    activeSession
      ? state.containers[activeSession.workspaceId]?.status ?? 'none'
      : 'none',
  );

  useEffect(() => {
    if (!activeSession) return;
    if (!activeWorkspaceContainerEnabled) return;
    if (containerStatus === 'running' || containerStatus === 'starting') return;

    useContainerStore.getState().setStarting(activeSession.workspaceId);
    void window.sero.container
      .ensure(activeSession.workspaceId)
      .then((info) => {
        if (info) {
          useContainerStore.getState().setRunning(
            activeSession.workspaceId,
            info.ipAddress,
          );
        }
      })
      .catch((err) => {
        console.error('[useSessionAgent] container.ensure failed:', err);
        useContainerStore.getState().setError(
          activeSession.workspaceId,
          err instanceof Error ? err.message : 'Container failed to start',
        );
      });
  }, [activeSession, activeWorkspaceContainerEnabled, containerStatus]);
}
