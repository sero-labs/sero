import type {
  CollaborationEvent,
  CollaborationResult,
  CollaborationSpecialistOutput,
  CollaborationStatus,
} from '@/types/collaboration';

export interface CollaborationSessionState {
  mode: boolean;
  status: CollaborationStatus;
  result: CollaborationResult | null;
  specialists: CollaborationSpecialistOutput[];
}

export type CollaborationSessionMap = Record<string, CollaborationSessionState>;

export function createCollaborationSessionState(): CollaborationSessionState {
  return {
    mode: false,
    status: 'idle',
    result: null,
    specialists: [],
  };
}

function getSessionState(
  collaborations: CollaborationSessionMap,
  sessionId: string,
): CollaborationSessionState {
  return collaborations[sessionId] ?? createCollaborationSessionState();
}

export function resetCollaborationSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
): CollaborationSessionMap {
  return {
    ...collaborations,
    [sessionId]: createCollaborationSessionState(),
  };
}

export function removeCollaborationSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
): CollaborationSessionMap {
  const { [sessionId]: _removed, ...rest } = collaborations;
  return rest;
}

export function toggleCollaborationModeForSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
): CollaborationSessionMap {
  const current = getSessionState(collaborations, sessionId);
  return {
    ...collaborations,
    [sessionId]: {
      ...current,
      mode: !current.mode,
    },
  };
}

export function startCollaborationForSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
): CollaborationSessionMap {
  const current = getSessionState(collaborations, sessionId);
  return {
    ...collaborations,
    [sessionId]: {
      ...current,
      status: 'research',
      result: null,
      specialists: [],
    },
  };
}

export function setCollaborationErrorForSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
): CollaborationSessionMap {
  const current = getSessionState(collaborations, sessionId);
  return {
    ...collaborations,
    [sessionId]: {
      ...current,
      status: 'error',
    },
  };
}

export function applyCollaborationEvent(
  collaborations: CollaborationSessionMap,
  event: CollaborationEvent,
): CollaborationSessionMap {
  const current = getSessionState(collaborations, event.sessionId);

  switch (event.type) {
    case 'collab_start':
      return {
        ...collaborations,
        [event.sessionId]: {
          ...current,
          status: 'research',
          result: null,
          specialists: [],
        },
      };

    case 'collab_phase':
      return {
        ...collaborations,
        [event.sessionId]: {
          ...current,
          status: event.phase,
        },
      };

    case 'collab_specialist_end':
      return {
        ...collaborations,
        [event.sessionId]: {
          ...current,
          specialists: [
            ...current.specialists,
            {
              role: event.role,
              agentName: event.agentName,
              response: event.response,
              error: event.error,
              durationMs: event.durationMs,
            },
          ],
        },
      };

    case 'collab_end':
      return {
        ...collaborations,
        [event.sessionId]: {
          ...current,
          status: 'complete',
          result: event.result,
        },
      };

    case 'collab_error':
      return {
        ...collaborations,
        [event.sessionId]: {
          ...current,
          status: 'error',
        },
      };

    case 'collab_specialist_start':
      // No state change needed — specialist progress is tracked via collab_specialist_end.
      return collaborations;

    default: {
      // Exhaustive check — ensures all event types are handled at compile time.
      const _exhaustive: never = event;
      return collaborations;
    }
  }
}
