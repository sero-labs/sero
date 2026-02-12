import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';

/**
 * Bridges session selection → agent lifecycle.
 *
 * When activeSessionId changes:
 *   - Opens an AgentSession in the pool (if not already open)
 *   - Focuses it in the ChatPanel
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
  const agents = useAgentStore((s) => s.agents);

  // Track previous streaming states to detect agent_end across all agents
  const prevStreamingRef = useRef<Record<string, boolean>>({});

  // Open/focus agent session when selection changes or sessions load
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  useEffect(() => {
    if (!activeSessionId) {
      clearFocus();
      return;
    }

    if (!activeSession) return; // Sessions not loaded yet

    // If already in the pool, just focus it
    if (agents[activeSessionId]) {
      focusSession(activeSessionId);
    } else {
      // Opens in pool + focuses
      openSession(activeSessionId, activeSession.path, activeSession.workspaceId);
    }
  }, [activeSessionId, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
