import type { SeroSlashCommandInfo, SessionModelState } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import type { AgentInstance, AgentState } from '@/stores/agent-types';

type AgentSelectorState = Pick<AgentState, 'agents' | 'focusedSessionId' | 'collaborations'>;

const EMPTY_SPECIALISTS: [] = [];
const EMPTY_STREAMING_SESSION_IDS: string[] = [];
const EMPTY_COMMANDS: SeroSlashCommandInfo[] = [];

let streamingCacheAgentsRef: AgentState['agents'] | null = null;
let streamingCacheIds: string[] = EMPTY_STREAMING_SESSION_IDS;

let focusedCommandsAgentsRef: AgentState['agents'] | null = null;
let focusedCommandsSessionId: string | null = null;
let focusedCommandsValue: SeroSlashCommandInfo[] = EMPTY_COMMANDS;

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function selectStreamingSessionIds(state: AgentSelectorState): string[] {
  if (streamingCacheAgentsRef === state.agents) {
    return streamingCacheIds;
  }

  const nextIds = Object.values(state.agents)
    .filter((agent) => agent.isStreaming)
    .map((agent) => agent.sessionId);

  streamingCacheAgentsRef = state.agents;

  if (nextIds.length === 0) {
    streamingCacheIds = EMPTY_STREAMING_SESSION_IDS;
    return streamingCacheIds;
  }

  if (areStringArraysEqual(nextIds, streamingCacheIds)) {
    return streamingCacheIds;
  }

  streamingCacheIds = nextIds;
  return streamingCacheIds;
}

function selectFocusedCommands(state: AgentSelectorState): SeroSlashCommandInfo[] {
  const focusedId = state.focusedSessionId;
  if (!focusedId) {
    focusedCommandsAgentsRef = state.agents;
    focusedCommandsSessionId = null;
    focusedCommandsValue = EMPTY_COMMANDS;
    return EMPTY_COMMANDS;
  }

  if (
    focusedCommandsAgentsRef === state.agents &&
    focusedCommandsSessionId === focusedId
  ) {
    return focusedCommandsValue;
  }

  focusedCommandsAgentsRef = state.agents;
  focusedCommandsSessionId = focusedId;
  focusedCommandsValue = state.agents[focusedId]?.commands ?? EMPTY_COMMANDS;
  return focusedCommandsValue;
}

export function useFocusedAgent(): AgentInstance | null {
  return useAgentStore((s) => {
    const focusedId = s.focusedSessionId;
    return focusedId ? (s.agents[focusedId] ?? null) : null;
  });
}

export function useFocusedSessionId(): string | null {
  return useAgentStore((s) => s.focusedSessionId);
}

export function useFocusedWorkspaceId(): string | null {
  return useAgentStore((s) => {
    const focusedId = s.focusedSessionId;
    return focusedId ? (s.agents[focusedId]?.workspaceId ?? null) : null;
  });
}

export function useFocusedModelState(): SessionModelState | null {
  return useAgentStore((s) => {
    const focusedId = s.focusedSessionId;
    return focusedId ? (s.agents[focusedId]?.modelState ?? null) : null;
  });
}

export function useStreamingSessionIds(): string[] {
  return useAgentStore(selectStreamingSessionIds);
}

export function useFocusedCommands(): SeroSlashCommandInfo[] {
  return useAgentStore(selectFocusedCommands);
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
    s.focusedSessionId
      ? (s.collaborations[s.focusedSessionId]?.specialists ?? EMPTY_SPECIALISTS)
      : EMPTY_SPECIALISTS,
  );
}

export function useFocusedCollaborationStrategy() {
  return useAgentStore((s) =>
    s.focusedSessionId ? (s.collaborations[s.focusedSessionId]?.strategy ?? 'standard') : 'standard',
  );
}

export function useFocusedCollaborationPendingUserQuery() {
  return useAgentStore((s) =>
    s.focusedSessionId
      ? (s.collaborations[s.focusedSessionId]?.pendingUserQuery ?? null)
      : null,
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
