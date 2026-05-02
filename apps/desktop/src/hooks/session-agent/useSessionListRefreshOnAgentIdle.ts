import { useEffect, useRef } from 'react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';

const SESSION_LIST_REFRESH_DEBOUNCE_MS = 200;

export function useSessionListRefreshOnAgentIdle(): void {
  const agents = useAgentStore((state) => state.agents);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const prevStreamingRef = useRef<Record<string, boolean>>({});
  const refreshSessions = useDebouncedCallback(() => {
    void loadSessions();
  }, SESSION_LIST_REFRESH_DEBOUNCE_MS);

  useEffect(() => {
    const prevStreaming = prevStreamingRef.current;
    let anyFinished = false;

    for (const [sessionId, agent] of Object.entries(agents)) {
      if (prevStreaming[sessionId] && !agent.isStreaming) {
        anyFinished = true;
        break;
      }
    }

    prevStreamingRef.current = Object.fromEntries(
      Object.entries(agents).map(([sessionId, agent]) => [sessionId, agent.isStreaming]),
    );

    if (anyFinished) {
      refreshSessions();
    }
  }, [agents, refreshSessions]);
}
