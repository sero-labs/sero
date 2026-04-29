import type {
  CollaborationEvent,
  CollaborationStateSnapshot,
} from '@/types/collaboration';
import type { AgentState } from '@/stores/agent-types';
import {
  applyCollaborationEvent,
  hydrateCollaborationSessionForRenderer,
  setCollaborationErrorForSession,
  startCollaborationForSession,
} from '@/stores/agent-collaboration';

type SetFn = (
  fn: (state: AgentState) => Partial<AgentState> | AgentState,
) => void;

type GetFn = () => AgentState;

function isCollaborationBusyStatus(
  status: CollaborationStateSnapshot['status'],
): boolean {
  return status !== 'idle' && status !== 'complete' && status !== 'error';
}

export async function sendCollaborationPromptWithState(
  set: SetFn,
  get: GetFn,
  sessionId: string,
  text: string,
): Promise<void> {
  const agent = get().agents[sessionId];
  if (!agent) return;

  const collabState = get().collaborations[sessionId];
  const strategy = collabState?.strategy ?? 'standard';
  const debateConfig = collabState?.debateConfig;

  set((state) => ({
    collaborations: startCollaborationForSession(
      state.collaborations,
      sessionId,
      text,
    ),
    agents: {
      ...state.agents,
      [sessionId]: {
        ...state.agents[sessionId],
        error: null,
        isStreaming: true,
      },
    },
  }));

  try {
    await window.sero.collaboration.prompt(sessionId, agent.workspaceId, text, {
      strategy,
      debate: strategy === 'debate' ? debateConfig : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Collaboration failed';
    set((state) => ({
      collaborations: setCollaborationErrorForSession(state.collaborations, sessionId),
      agents: {
        ...state.agents,
        [sessionId]: {
          ...state.agents[sessionId],
          error: message,
          isStreaming: false,
        },
      },
    }));
  }
}

export function hydrateCollaborationStateWithSnapshot(
  set: SetFn,
  sessionId: string,
  snapshot: CollaborationStateSnapshot | null,
): void {
  if (!snapshot) return;

  set((state) => {
    const agent = state.agents[sessionId];
    if (!agent) return state;

    const collaborationBusy = isCollaborationBusyStatus(snapshot.status);
    return {
      collaborations: hydrateCollaborationSessionForRenderer(
        state.collaborations,
        sessionId,
        snapshot,
      ),
      agents: {
        ...state.agents,
        [sessionId]: {
          ...agent,
          error: snapshot.error ?? (collaborationBusy ? null : agent.error),
          isStreaming: agent.isStreaming || collaborationBusy,
        },
      },
    };
  });
}

export function reduceCollaborationEventState(
  state: AgentState,
  event: CollaborationEvent,
): Pick<AgentState, 'agents' | 'collaborations'> {
  const agent = state.agents[event.sessionId];
  let agents = state.agents;

  if (agent && event.type === 'collab_start') {
    agents = {
      ...state.agents,
      [event.sessionId]: {
        ...agent,
        error: null,
        isStreaming: true,
      },
    };
  } else if (agent && event.type === 'collab_error') {
    agents = {
      ...state.agents,
      [event.sessionId]: {
        ...agent,
        error: event.error,
        isStreaming: false,
      },
    };
  }

  return {
    agents,
    collaborations: applyCollaborationEvent(state.collaborations, event),
  };
}
