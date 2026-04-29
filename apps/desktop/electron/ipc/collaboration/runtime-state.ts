import type {
  CollaborationEvent,
  CollaborationStateSnapshot,
  CollaborationStrategy,
  DebateConfig,
  DebateRound,
} from '@/types/collaboration';
import { DEFAULT_DEBATE_CONFIG } from '@/types/collaboration';

const runtimeStates = new Map<string, CollaborationStateSnapshot>();

function cloneSnapshot(
  snapshot: CollaborationStateSnapshot,
): CollaborationStateSnapshot {
  return {
    ...snapshot,
    result: snapshot.result
      ? {
          ...snapshot.result,
          specialistOutputs: [...snapshot.result.specialistOutputs],
        }
      : null,
    specialists: [...snapshot.specialists],
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
  };
}

export function createCollaborationRuntimeSnapshot(
  strategy: CollaborationStrategy,
  debateConfig: DebateConfig | undefined,
  query: string,
): CollaborationStateSnapshot {
  const resolvedDebateConfig = {
    ...DEFAULT_DEBATE_CONFIG,
    ...debateConfig,
  };

  return {
    mode: false,
    strategy,
    status: 'research',
    result: null,
    specialists: [],
    debate:
      strategy === 'debate'
        ? {
            phase: 'decomposition',
            currentRound: 0,
            totalRounds: resolvedDebateConfig.maxRounds,
            rounds: [],
            agentStatuses: {},
            startedAt: Date.now(),
            timeLimitSec: resolvedDebateConfig.timeLimitSec,
          }
        : null,
    debateConfig: resolvedDebateConfig,
    pendingUserQuery: query.trim() || query,
    error: null,
  };
}

export function setCollaborationRuntimeSnapshot(
  sessionId: string,
  snapshot: CollaborationStateSnapshot,
): void {
  runtimeStates.set(sessionId, cloneSnapshot(snapshot));
}

export function getCollaborationRuntimeSnapshot(
  sessionId: string,
): CollaborationStateSnapshot | null {
  const snapshot = runtimeStates.get(sessionId);
  return snapshot ? cloneSnapshot(snapshot) : null;
}

function updateSnapshot(
  sessionId: string,
  update: (snapshot: CollaborationStateSnapshot) => CollaborationStateSnapshot,
): void {
  const current = runtimeStates.get(sessionId);
  if (!current) return;
  runtimeStates.set(sessionId, update(current));
}

export function applyCollaborationRuntimeEvent(event: CollaborationEvent): void {
  switch (event.type) {
    case 'collab_start':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        mode: false,
        strategy: event.strategy,
        status: 'research',
        result: null,
        specialists: [],
        error: null,
        debate:
          event.strategy === 'debate'
            ? {
                phase: 'decomposition',
                currentRound: 0,
                totalRounds: snapshot.debateConfig.maxRounds,
                rounds: [],
                agentStatuses: {},
                startedAt: Date.now(),
                timeLimitSec: snapshot.debateConfig.timeLimitSec,
              }
            : null,
      }));
      return;

    case 'collab_phase':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        status: event.phase,
      }));
      return;

    case 'collab_specialist_start':
      return;

    case 'collab_specialist_end':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        specialists: [
          ...snapshot.specialists,
          {
            role: event.role,
            agentName: event.agentName,
            response: event.response,
            error: event.error,
            durationMs: event.durationMs,
          },
        ],
      }));
      return;

    case 'collab_end':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        status: 'complete',
        result: event.result,
        pendingUserQuery: null,
        error: null,
      }));
      return;

    case 'collab_error':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        status: 'error',
        error: event.error,
      }));
      return;

    case 'collab_debate_phase':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        debate: snapshot.debate
          ? {
              ...snapshot.debate,
              phase: event.phase,
            }
          : snapshot.debate,
      }));
      return;

    case 'collab_debate_agent_status':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        debate: snapshot.debate
          ? {
              ...snapshot.debate,
              agentStatuses: {
                ...snapshot.debate.agentStatuses,
                [event.agentName]: event.status,
              },
            }
          : snapshot.debate,
      }));
      return;

    case 'collab_debate_round_start':
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        debate: snapshot.debate
          ? {
              ...snapshot.debate,
              currentRound: event.round,
              totalRounds: event.totalRounds,
            }
          : snapshot.debate,
      }));
      return;

    case 'collab_debate_round_end': {
      const round: DebateRound = {
        roundNumber: event.round,
        challengerRole: event.challengerRole,
        defenderRole: event.defenderRole,
        summary: event.summary,
        durationMs: event.durationMs,
      };
      updateSnapshot(event.sessionId, (snapshot) => ({
        ...snapshot,
        debate: snapshot.debate
          ? {
              ...snapshot.debate,
              rounds: [...snapshot.debate.rounds, round],
            }
          : snapshot.debate,
      }));
      return;
    }
  }
}
