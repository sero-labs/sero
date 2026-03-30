import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';
import { useWorkspaceStore } from '@/stores/workspace';
import { useContainerStore } from '@/stores/container';

/**
 * Bridges session selection → agent lifecycle + container lifecycle.
 *
 * When activeSessionId changes:
 *   - Opens an AgentSession in the pool (if not already open)
 *   - Focuses it in the ChatPanel
 *   - Ensures the workspace container is running (if container-enabled)
 *
 * When activeSessionId becomes null:
 *   - Clears ChatPanel focus (agents stay alive in pool)
 *
 * Also refreshes the session list after any agent finishes a turn
 * so the sidebar shows updated firstMessage / messageCount.
 */
export function useSessionAgent() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const openSession = useAgentStore((s) => s.openSession);
  const focusSession = useAgentStore((s) => s.focusSession);
  const clearFocus = useAgentStore((s) => s.clearFocus);
  const hydrateCollaborationState = useAgentStore(
    (s) => s.hydrateCollaborationState,
  );
  const agents = useAgentStore((s) => s.agents);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  // Track previous streaming states to detect agent_end across all agents
  const prevStreamingRef = useRef<Record<string, boolean>>({});

  // Open/focus agent session when selection changes or sessions load
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  useEffect(() => {
    let cancelled = false;

    async function syncActiveSession() {
      if (!activeSessionId) {
        clearFocus();
        return;
      }

      if (!activeSession) return; // Sessions not loaded yet

      try {
        // If fully initialized in the pool, just focus it.
        // Partial entries (from events arriving before openSession) won't
        // have a sessionId field — route those through openSession to repair.
        if (agents[activeSessionId]?.sessionId) {
          focusSession(activeSessionId);
        } else {
          // Opens in pool + focuses (also repairs partial entries)
          await openSession(activeSessionId, activeSession.path, activeSession.workspaceId);
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
  }, [activeSessionId, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure the container is running whenever a container-enabled workspace
  // session is selected. This runs independently of agent.open so the
  // container is available for file trees, terminals, and editor operations
  // even when the agent session was already open in the pool.
  //
  // `activeWsContainer` is derived from the workspaces array so the effect
  // re-runs when workspaces load asynchronously after sessions (fixes reload).
  const activeWsContainer = activeSession
    ? workspaces.find((w) => w.id === activeSession.workspaceId)?.container
    : undefined;

  useEffect(() => {
    if (!activeSession) return;
    if (!activeWsContainer) return; // Host-mode or workspaces not loaded yet

    const containerState = useContainerStore.getState();
    const current = containerState.containers[activeSession.workspaceId];

    // Already running or in the process of starting — skip
    if (current?.status === 'running' || current?.status === 'starting') return;

    // Fire-and-forget: start the container and update the store
    containerState.setStarting(activeSession.workspaceId);
    window.sero.container
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
  }, [activeSession?.id, activeSession?.workspaceId, activeWsContainer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh session list when any agent finishes a turn
  useEffect(() => {
    const prevStreaming = prevStreamingRef.current;
    let anyFinished = false;

    for (const [sid, agent] of Object.entries(agents)) {
      if (prevStreaming[sid] && !agent.isStreaming) {
        anyFinished = true;
      }
    }

    // Update ref
    const next: Record<string, boolean> = {};
    for (const [sid, agent] of Object.entries(agents)) {
      next[sid] = agent.isStreaming;
    }
    prevStreamingRef.current = next;

    if (anyFinished) {
      loadSessions();
    }
  }, [agents, loadSessions]);
}
