/**
 * Goal mode domain records (issue #409, phase 1).
 *
 * A Goal is one repeating unit of work with a completion contract. It is
 * deliberately SEPARATE from the Workflow `Loop` records and from Room records:
 * Workflow is a step DAG, Room is a roster, Goal is a single objective driven
 * turn by turn inside one chat session.
 *
 * The workspace record is the source of truth (D02). The in-session contract
 * message is a projection of it, re-derived at session start and after every
 * state change, because session entries alone die with forks and clears.
 */

import type { LoopLimits } from './types';

/**
 * `active`   — the goal continues itself at each settled boundary.
 * `waiting`  — parked on a registered condition or a bounded timer.
 * `paused`   — the user, an abort, a no-progress hold, or a restore stopped it.
 * `blocked`  — the agent reported an impasse it cannot pass alone.
 * `limited`  — a turn, token, cost or wall-clock budget is exhausted.
 * `complete` — the completion contract was satisfied.
 *
 * Limit exhaustion is NOT completion (rule 6), which is why `limited` is its
 * own state rather than a flag on `complete`.
 */
export type GoalStatus = 'active' | 'waiting' | 'paused' | 'blocked' | 'limited' | 'complete';

export const GOAL_STATUSES: readonly GoalStatus[] = [
  'active',
  'waiting',
  'paused',
  'blocked',
  'limited',
  'complete',
];

/** Why a goal is paused. `abort` is escape or cancel; `restore` is a restart hold. */
export type GoalPauseReason = 'user' | 'abort' | 'no-progress' | 'restore' | 'tool-policy';

/**
 * Goal budgets, taken from the Orchestrator limit shape rather than a parallel
 * one. Automatic turns map to `maxAttemptsTotal`: a goal turn is the goal's
 * attempt at its objective.
 */
export type GoalLimitKey = 'maxAttemptsTotal' | 'maxWallClockMs' | 'maxTotalTokens' | 'maxCostUsd';
export type GoalLimits = Pick<LoopLimits, GoalLimitKey>;

/**
 * What the goal has spent. Only turns the goal itself started are charged —
 * user turns, resumes and edits are not.
 */
export interface GoalUsage {
  automaticTurns: number;
  totalTokens: number;
  costUsd: number;
  /** Elapsed time in `active`. Paused, waiting and blocked time is not charged. */
  activeMs: number;
}

/**
 * The no-progress ledger. A turn cap alone burns its whole budget on an agent
 * repeating itself, so identical visible outcomes are counted and held on.
 * Any attempted tool call resets the count.
 */
export interface GoalProgressLedger {
  lastFingerprint?: string;
  repeats: number;
}

/** Why the goal is parked, and the backstop timer if one was set. */
export interface GoalWait {
  reason: string;
  /** ISO timestamp. A bounded backstop, never a polling interval. */
  until?: string;
}

export interface GoalBlock {
  reason: string;
  evidence?: string;
}

/**
 * The agent's completion claim. Phase 1 records it and shows it as "reported
 * complete"; the verification gate that turns a claim into a verdict is
 * phase 2 (D03).
 */
export interface GoalCompletionReport {
  evidence: string;
  reportedAt: string;
}

export interface GoalTransition {
  at: string;
  from: GoalStatus;
  to: GoalStatus;
  reason: string;
}

export interface Goal {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  /**
   * The Pi session file this goal drives. It is the strongest caller signal
   * available: a session cannot report another session's path, so a terminal
   * tool call from a different session is refused rather than silently
   * completing this goal.
   */
  sessionPath: string;
  /**
   * The host session id, used ONLY to arbitrate one autonomous driver per
   * session against active-session Workflow steps (D06). Best effort: null when
   * no active session could be resolved, in which case no lock is held.
   */
  sessionId: string | null;
  /** User text. Carried as task data, never as instructions (see goal-contract.ts). */
  objective: string;
  /** Completion criteria the agent must satisfy before it may report complete. */
  criteria: string[];
  status: GoalStatus;
  limits: GoalLimits;
  usage: GoalUsage;
  progress: GoalProgressLedger;
  /** Start of the current `active` span, folded into `usage.activeMs` when it ends. */
  activeSince?: string;
  pauseReason?: GoalPauseReason;
  wait?: GoalWait;
  block?: GoalBlock;
  limitReached?: GoalLimitKey;
  reportedComplete?: GoalCompletionReport;
  /**
   * Set when the user stopped the goal. The record and its last status stay for
   * the history; the goal is no longer live, so the session may start another.
   */
  closedAt?: string;
  history: GoalTransition[];
  createdAt: string;
  updatedAt: string;
}

/** Watched summary list, so a management view never opens every goal file. */
export interface GoalIndexEntry {
  id: string;
  objective: string;
  status: GoalStatus;
  sessionPath: string;
  updatedAt: string;
}

export interface GoalIndex {
  schemaVersion: 1;
  goals: GoalIndexEntry[];
}

/**
 * What the in-session loop reports about the turn that just settled. The
 * extension is the only place that can see this: a background runtime sees
 * `{turnId, status}` and could not fingerprint an outcome (D01).
 */
export interface GoalTurnReport {
  goalId: string;
  /** The session making the claim, checked against `Goal.sessionPath`. */
  sessionPath: string;
  /** sha256 of the normalised visible assistant text. */
  fingerprint: string;
  /** The turn attempted at least one tool call, so it made progress. */
  toolAttempted: boolean;
  /** The goal itself started this turn, so it is charged to the goal budget. */
  automatic: boolean;
  totalTokens: number;
  costUsd: number;
}

/**
 * The runtime's answer to "may this session continue itself now?". Anything
 * other than `continue` is already persisted on the returned goal — the
 * extension applies it, it does not decide it.
 */
export type GoalVerdict =
  | { kind: 'continue'; goal: Goal }
  | { kind: 'hold-no-progress'; goal: Goal; reason: string }
  | { kind: 'limited'; goal: Goal; limit: GoalLimitKey; reason: string }
  | { kind: 'waiting'; goal: Goal; reason: string }
  | { kind: 'inactive'; goal?: Goal; reason: string };

/** Every runtime entry point answers in this shape, so callers render one thing. */
export interface GoalOutcome {
  ok: boolean;
  text: string;
  goal?: Goal;
}
