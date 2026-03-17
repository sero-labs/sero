import type { SeroSlashCommandInfo, SessionModelState } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import type { AgentInstance } from '@/stores/agent-types';

const EMPTY_SPECIALISTS: [] = [];

export function useFocusedAgent(): AgentInstance | null {
  return useAgentStore((s) => {
    const focusedId = s.focusedSessionId;
    return focusedId ? (s.agents[focusedId] ?? null) : null;
  });
}

export function useFocusedSessionId(): string | null {
  return useAgentStore((s) => s.focusedSessionId);
}

export function useFocusedModelState(): SessionModelState | null {
  return useAgentStore((s) => {
    const focusedId = s.focusedSessionId;
    return focusedId ? (s.agents[focusedId]?.modelState ?? null) : null;
  });
}

export function useStreamingSessionIds(): string[] {
  const agents = useAgentStore((s) => s.agents);
  return Object.values(agents)
    .filter((a) => a.isStreaming)
    .map((a) => a.sessionId);
}

export function useActiveAgentCount(): number {
  const agents = useAgentStore((s) => s.agents);
  return Object.keys(agents).length;
}

export function useIsSessionActive(sessionId: string): boolean {
  return useAgentStore((s) => !!s.agents[sessionId]);
}

export function useFocusedCommands(): SeroSlashCommandInfo[] {
  const agents = useAgentStore((s) => s.agents);
  const focusedId = useAgentStore((s) => s.focusedSessionId);
  if (!focusedId) return [];
  return agents[focusedId]?.commands ?? [];
}

export function useFocusedCollaborationMode(): boolean {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.mode ?? false) : false,
  );
}

export function useFocusedCollaborationStatus() {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.status ?? 'idle') : 'idle',
  );
}

export function useFocusedCollaborationResult() {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.result ?? null) : null,
  );
}

export function useFocusedCollaborationSpecialists() {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.specialists ?? EMPTY_SPECIALISTS) : EMPTY_SPECIALISTS,
  );
}

export function useFocusedCollaborationStrategy() {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.strategy ?? 'standard') : 'standard',
  );
}

export function useFocusedDebateState() {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.debate ?? null) : null,
  );
}

export function useFocusedDebateConfig() {
  return useAgentStore((s) =>
    s.focusedSessionId
      ? (s.collaborations[s.focusedSessionId]?.debateConfig ?? null)
      : null,
  );
}
