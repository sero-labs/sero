import type { Goal, GoalIndex } from '../../shared/goal-types';
import { useStateDir } from './use-orchestrator-index';
import { useWatchedJson } from './use-watched-json';

const EMPTY_GOAL_INDEX: GoalIndex = { schemaVersion: 1, goals: [] };

/** Watches the summary index. The list never opens each Goal record. */
export function useGoalIndex(): GoalIndex {
  const stateDir = useStateDir();
  return useWatchedJson<GoalIndex>(stateDir ? `${stateDir}/goals/index.json` : null, EMPTY_GOAL_INDEX);
}

/** Watches only the Goal record selected in the management view. */
export function useGoal(goalId: string | null): Goal | null {
  const stateDir = useStateDir();
  return useWatchedJson<Goal | null>(goalId && stateDir ? `${stateDir}/goals/${goalId}.json` : null, null);
}
