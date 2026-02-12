import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';

/**
 * Bridges session selection → agent lifecycle.
 *
 * When activeSessionId changes, opens the corresponding session
 * in the agent. When it becomes null, closes the agent session.
 * Also refreshes the session list after the agent finishes a turn
 * so the sidebar shows updated firstMessage / messageCount.
 */
export function useSessionAgent() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const openSession = useAgentStore((s) => s.openSession);
  const closeSession = useAgentStore((s) => s.closeSession);
  const isStreaming = useAgentStore((s) => s.isStreaming);

  // Track previous streaming state to detect agent_end
  const wasStreaming = useRef(false);

  // Open/close agent session when selection changes
  useEffect(() => {
    if (!activeSessionId) {
      closeSession();
      return;
    }

    const session = sessions.find((s) => s.id === activeSessionId);
    if (session) {
      openSession(session.path);
    }
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh session list when agent finishes a turn
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) {
      loadSessions();
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, loadSessions]);
}
