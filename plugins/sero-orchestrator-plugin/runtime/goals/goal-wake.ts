/**
 * The runtime-to-loop signal for a Goal that a registered wait just woke.
 *
 * The Goal loop stays in the chat extension: it is the only thing that starts
 * a Goal turn. The runtime cannot start one, so it persists the goal as
 * active and tells the loop. The runtime entry and the extension entry are
 * loaded separately, so the listeners live on `globalThis`, like the registry.
 * A signal with no listener is harmless: the persisted active goal is started
 * when its session next opens.
 */

import type { Goal } from '../../shared/goal-types';

export type GoalWakeListener = (goal: Goal) => void;

const KEY = '__seroOrchestratorGoalWake';

function listeners(): Map<string, GoalWakeListener> {
  const scope = globalThis as Record<string, unknown>;
  const existing = scope[KEY] as Map<string, GoalWakeListener> | undefined;
  if (existing) return existing;
  const created = new Map<string, GoalWakeListener>();
  scope[KEY] = created;
  return created;
}

/** One listener per session file: a later registration replaces the earlier one. */
export function onGoalWake(sessionPath: string, listener: GoalWakeListener): void {
  listeners().set(sessionPath, listener);
}

export function notifyGoalWake(goal: Goal): void {
  listeners().get(goal.sessionPath)?.(goal);
}
