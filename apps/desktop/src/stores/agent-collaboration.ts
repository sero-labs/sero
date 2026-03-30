import type {
  CollaborationEvent,
  CollaborationResult,
  CollaborationSpecialistOutput,
  CollaborationStateSnapshot,
  CollaborationStatus,
  CollaborationStrategy,
  DebateState,
  DebatePhase,
  DebateRound,
  DebateConfig,
} from '@/types/collaboration';
import { DEFAULT_DEBATE_CONFIG } from '@/types/collaboration';

export interface CollaborationSessionState extends CollaborationStateSnapshot {}

export type CollaborationSessionMap = Record<string, CollaborationSessionState>;

export function createCollaborationSessionState(): CollaborationSessionState {
  return {
    mode: false,
    strategy: 'standard',
    status: 'idle',
    result: null,
    specialists: [],
    debate: null,
    debateConfig: { ...DEFAULT_DEBATE_CONFIG },
    pendingUserQuery: null,
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

export function setCollaborationStrategyForSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
  strategy: CollaborationStrategy,
): CollaborationSessionMap {
  const current = getSessionState(collaborations, sessionId);
  return {
    ...collaborations,
    [sessionId]: {
      ...current,
      strategy,
    },
  };
}

export function setDebateConfigForSession(
  collaborations: CollaborationSessionMap,
  sessionId: string,
  config: Partial<DebateConfig>,
): CollaborationSessionMap {
  const current = getSessionState(collaborations, sessionId);
  return {
    ...collaborations,
    [sessionId]: {
      ...current,
      debateConfig: { ...current.debateConfig, ...config },
    },
  };
}

export function hydrateCollaborationSessionForRenderer(
  collaborations: CollaborationSessionMap,
  sessionId: string,
  snapshot: CollaborationStateSnapshot | null,
): CollaborationSessionMap {
  if (!snapshot) return collaborations;

  return {
    ...collaborations,
    [sessionId]: {
      ...snapshot,
      specialists: [...snapshot.specialists],
      result: snapshot.result
        ? {
            ...snapshot.result,
            specialistOutputs: [...snapshot.result.specialistOutputs],
          }
        : null,
      debate: snapshot.debate
        ? {
            ...snapshot.debate,
            rounds: [...snapshot.debate.rounds],
            agentStatuses: { ...snapshot.debate.agentStatuses },
          }
        : null,
      debateConfig: {
        ...snapshot.debateConfig,
        ...(snapshot.debateConfig.models
          ? { models: { ...snapshot.debateConfig.models } }
          : {}),
      },
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
      mode: false,
      status: current.strategy === 'debate' ? 'research' : 'research',
      result: null,
      specialists: [],
      debate: current.strategy === 'debate'
        ? {
            phase: 'decomposition',
            currentRound: 0,
            totalRounds: current.debateConfig.maxRounds,
            rounds: [],
            agentStatuses: {},
            startedAt: Date.now(),
            timeLimitSec: current.debateConfig.timeLimitSec,
          }
        : null,
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

function applyDebateEvent(
  state: CollaborationSessionState,
  event: CollaborationEvent,
): CollaborationSessionState {
  if (!state.debate) return state;

  switch (event.type) {
    case 'collab_debate_phase':
      return {
        ...state,
        debate: { ...state.debate, phase: event.phase as DebatePhase },
      };

    case 'collab_debate_agent_status':
      return {
        ...state,
        debate: {
          ...state.debate,
          agentStatuses: {
            ...state.debate.agentStatuses,
            [event.agentName]: event.status,
          },
        },
      };

    case 'collab_debate_round_start':
      return {
        ...state,
        debate: {
          ...state.debate,
          currentRound: event.round,
          totalRounds: event.totalRounds,
        },
      };

    case 'collab_debate_round_end': {
      const round: DebateRound = {
        roundNumber: event.round,
        challengerRole: event.challengerRole,
        defenderRole: event.defenderRole,
        summary: event.summary,
        durationMs: event.durationMs,
      };
      return {
        ...state,
        debate: {
          ...state.debate,
          rounds: [...state.debate.rounds, round],
        },
      };
    }

    default:
      return state;
  }
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
          mode: false,
          strategy: event.strategy,
          status: 'research',
          result: null,
          specialists: [],
          debate: event.strategy === 'debate'
            ? {
                phase: 'decomposition',
                currentRound: 0,
                totalRounds: current.debateConfig.maxRounds,
                rounds: [],
                agentStatuses: {},
                startedAt: Date.now(),
                timeLimitSec: current.debateConfig.timeLimitSec,
              }
            : null,
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
      return collaborations;

    // Debate-specific events
    case 'collab_debate_phase':
    case 'collab_debate_agent_status':
    case 'collab_debate_round_start':
    case 'collab_debate_round_end':
      return {
        ...collaborations,
        [event.sessionId]: applyDebateEvent(current, event),
      };

    default: {
      const _exhaustive: never = event;
      return collaborations;
    }
  }
}
