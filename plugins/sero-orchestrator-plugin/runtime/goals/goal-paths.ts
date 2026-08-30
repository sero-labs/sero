/**
 * File layout for Goal mode, under the Orchestrator state dir and beside Rooms:
 *
 *   goals/index.json        — goal summaries (watched by the management view)
 *   goals/<goalId>.json     — one file per goal
 */

import path from 'node:path';

export interface GoalPaths {
  root: string;
  index: string;
  goal(goalId: string): string;
}

/**
 * Containment chokepoint: every id-derived path must resolve to a DIRECT child
 * of the goals dir, so a crafted goal id can never read or write outside it.
 */
function child(base: string, id: string): string {
  const resolved = path.resolve(base, id);
  if (path.dirname(resolved) !== path.resolve(base)) {
    throw new Error(`unsafe goal path segment: ${JSON.stringify(id)}`);
  }
  return resolved;
}

export function createGoalPaths(stateDir: string): GoalPaths {
  const root = path.join(stateDir, 'goals');
  return {
    root,
    index: path.join(root, 'index.json'),
    goal: (goalId) => `${child(root, goalId)}.json`,
  };
}
