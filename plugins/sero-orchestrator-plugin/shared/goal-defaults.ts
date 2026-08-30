/**
 * Goal mode defaults. The reference implementations converged on 25 automatic
 * turns and 3 identical outcomes, so those are the starting points here.
 */

import type { GoalLimits } from './goal-types';

/**
 * A conservative turn cap is the only default budget. Token and cost budgets
 * stay opt-in: a goal that trips one is `limited`, and a user who did not ask
 * for a spend ceiling should not meet one by surprise.
 */
export const DEFAULT_GOAL_LIMITS: GoalLimits = { maxAttemptsTotal: 25 };

/** Identical visible outcomes before the goal holds instead of continuing. */
export const NO_PROGRESS_REPEATS = 3;

/** The tools that stop a goal. Without all three it cannot be stopped, so it cannot start (D07). */
export const GOAL_TERMINAL_TOOLS = ['goal_complete', 'goal_blocked', 'goal_wait'] as const;
