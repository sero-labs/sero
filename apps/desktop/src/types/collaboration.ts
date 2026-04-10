/**
 * Collaboration framework IPC types — shared by Electron main process and renderer.
 */

/** Role identifiers for the four collaboration agents. */
export type CollaborationRole = 'coordinator' | 'researcher' | 'analyst' | 'visionary';

/** Status of the collaboration run. */
export type CollaborationStatus = 'idle' | 'research' | 'specialists' | 'synthesis' | 'complete' | 'error';

/** A single specialist's output for display in the UI. */
export interface CollaborationSpecialistOutput {
  role: CollaborationRole;
  agentName: string;
  response: string;
  error?: string;
  durationMs: number;
}

/** Full collaboration result sent to the renderer. */
export interface CollaborationResult {
  finalResponse: string;
  specialistOutputs: CollaborationSpecialistOutput[];
  totalDurationMs: number;
  hasErrors: boolean;
}

/** Snapshot of collaboration UI/runtime state for renderer rehydration. */
export interface CollaborationStateSnapshot {
  mode: boolean;
  strategy: CollaborationStrategy;
  status: CollaborationStatus;
  result: CollaborationResult | null;
  specialists: CollaborationSpecialistOutput[];
  debate: DebateState | null;
  debateConfig: DebateConfig;
  /** Original user query used to start the collaboration. */
  pendingUserQuery: string | null;
  /** Last collaboration error, if the run failed. */
  error: string | null;
}

// ── Strategy types ──────────────────────────────────────────────

/** Available collaboration strategies. */
export type CollaborationStrategy = 'standard' | 'debate';

/** Configuration for the debate strategy. */
export interface DebateConfig {
  /** Maximum number of debate rounds (default: 3). */
  maxRounds: number;
  /** Maximum total time in seconds for the debate phase (default: 120). */
  timeLimitSec: number;
  /** Model IDs for each agent role (uses defaults if omitted). */
  models?: Partial<Record<CollaborationRole, string>>;
}

/** Default debate configuration. */
export const DEFAULT_DEBATE_CONFIG: DebateConfig = {
  maxRounds: 1,
  timeLimitSec: 120,
};

/** Combined configuration sent with a collaboration prompt. */
export interface CollaborationConfig {
  strategy: CollaborationStrategy;
  debate?: DebateConfig;
}

// ── Debate-specific status tracking ─────────────────────────────

/** Phases of the debate strategy. */
export type DebatePhase =
  | 'decomposition'
  | 'independent_analysis'
  | 'debate'
  | 'synthesis';


/** Tracks a single debate round during the debate phase. */
export interface DebateRound {
  roundNumber: number;
  challengerRole: CollaborationRole;
  defenderRole: CollaborationRole;
  summary: string;
  durationMs: number;
}

/** Live state of a debate collaboration for the renderer. */
export interface DebateState {
  phase: DebatePhase;
  currentRound: number;
  totalRounds: number;
  rounds: DebateRound[];
  /** Per-agent status during independent analysis and debate. */
  agentStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed'>;
  startedAt: number;
  timeLimitSec: number;
}

// ── Events pushed from main → renderer during collaboration ─────

export type CollaborationEvent =
  | { type: 'collab_start'; sessionId: string; strategy: CollaborationStrategy }
  | { type: 'collab_phase'; sessionId: string; phase: 'research' | 'specialists' | 'synthesis' }
  | { type: 'collab_specialist_start'; sessionId: string; role: CollaborationRole; agentName: string }
  | { type: 'collab_specialist_end'; sessionId: string; role: CollaborationRole; agentName: string; response: string; durationMs: number; error?: string }
  | { type: 'collab_end'; sessionId: string; result: CollaborationResult }
  | { type: 'collab_error'; sessionId: string; error: string }
  // Debate-specific events
  | { type: 'collab_debate_phase'; sessionId: string; phase: DebatePhase }
  | { type: 'collab_debate_agent_status'; sessionId: string; agentName: string; status: 'pending' | 'running' | 'completed' | 'failed' }
  | { type: 'collab_debate_round_start'; sessionId: string; round: number; totalRounds: number; challengerRole: CollaborationRole; defenderRole: CollaborationRole }
  | { type: 'collab_debate_round_end'; sessionId: string; round: number; summary: string; durationMs: number; challengerRole: CollaborationRole; defenderRole: CollaborationRole };
