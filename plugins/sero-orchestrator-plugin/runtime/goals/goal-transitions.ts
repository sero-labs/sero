/**
 * The goal state machine, as pure functions over a record.
 *
 * Every transition goes through `transition`, which is the one place that
 * stamps history, keeps `activeSince` honest and folds a finished active span
 * into `usage.activeMs`. Nothing else may write `Goal.status`.
 */

import type {
  Goal,
  GoalBlock,
  GoalLimitKey,
  GoalPauseReason,
  GoalStatus,
  GoalTurnReport,
  GoalWait,
} from '../../shared/goal-types';
import { NO_PROGRESS_REPEATS } from '../../shared/goal-defaults';

export interface TransitionContext {
  now: string;
}

/**
 * Applies a status change. Entering `active` opens a time span; leaving it
 * closes one, so paused, waiting and blocked time is never charged.
 */
export function transition(goal: Goal, to: GoalStatus, reason: string, ctx: TransitionContext): Goal {
  const nowMs = Date.parse(ctx.now);
  const closing = goal.activeSince ? Math.max(0, nowMs - Date.parse(goal.activeSince)) : 0;
  const wasActive = goal.status === 'active';
  return {
    ...goal,
    status: to,
    activeSince: to === 'active' ? (wasActive ? goal.activeSince : ctx.now) : undefined,
    usage: { ...goal.usage, activeMs: goal.usage.activeMs + (to === 'active' && wasActive ? 0 : closing) },
    history: [...goal.history, { at: ctx.now, from: goal.status, to, reason }],
    updatedAt: ctx.now,
  };
}

/** Clears the reasons that belong to a state the goal is leaving. */
function cleared(goal: Goal): Goal {
  return { ...goal, pauseReason: undefined, wait: undefined, block: undefined, limitReached: undefined };
}

export function activate(goal: Goal, reason: string, ctx: TransitionContext): Goal {
  return transition(cleared(goal), 'active', reason, ctx);
}

export function pause(goal: Goal, pauseReason: GoalPauseReason, reason: string, ctx: TransitionContext): Goal {
  return { ...transition(cleared(goal), 'paused', reason, ctx), pauseReason };
}

export function wait(goal: Goal, waiting: GoalWait, ctx: TransitionContext): Goal {
  return { ...transition(cleared(goal), 'waiting', waiting.reason, ctx), wait: waiting };
}

export function block(goal: Goal, blocked: GoalBlock, ctx: TransitionContext): Goal {
  return { ...transition(cleared(goal), 'blocked', blocked.reason, ctx), block: blocked };
}

export function limit(goal: Goal, limitReached: GoalLimitKey, reason: string, ctx: TransitionContext): Goal {
  return { ...transition(cleared(goal), 'limited', reason, ctx), limitReached };
}

/**
 * Records the agent's completion claim. Phase 1 stops here and reports the goal
 * as "reported complete"; the verification gate that turns a claim into a
 * verdict is phase 2 (D03).
 */
export function reportComplete(goal: Goal, evidence: string, ctx: TransitionContext): Goal {
  return {
    ...transition(cleared(goal), 'complete', 'the agent reported the criteria met', ctx),
    reportedComplete: { evidence, reportedAt: ctx.now },
  };
}

/**
 * Charges a settled turn to the goal and updates the no-progress ledger.
 *
 * Only turns the goal itself started are charged. A user turn changes the
 * situation, so it clears the ledger instead of adding to it — and so does any
 * turn that attempted a tool call.
 */
export function recordTurn(goal: Goal, report: GoalTurnReport, ctx: TransitionContext): Goal {
  const repeated = report.automatic && !report.toolAttempted && goal.progress.lastFingerprint === report.fingerprint;
  return {
    ...goal,
    usage: report.automatic
      ? {
          ...goal.usage,
          automaticTurns: goal.usage.automaticTurns + 1,
          totalTokens: goal.usage.totalTokens + report.totalTokens,
          costUsd: goal.usage.costUsd + report.costUsd,
        }
      : goal.usage,
    progress: { lastFingerprint: report.fingerprint, repeats: repeated ? goal.progress.repeats + 1 : 0 },
    updatedAt: ctx.now,
  };
}

/** True once the same visible outcome has come back too many times in a row. */
export function isStalled(goal: Goal): boolean {
  return goal.progress.repeats + 1 >= NO_PROGRESS_REPEATS;
}
