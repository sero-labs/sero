/**
 * Durable goal records (D02). The workspace record is the source of truth; the
 * in-session contract is a projection of it.
 *
 * Writes go through the host app-state service, which writes atomically and
 * notifies the file watcher the management view subscribes to. Reads are served
 * from a cache that the store owns, so a settled-boundary check is not a disk
 * read on every turn.
 */

import type { Goal, GoalIndex, GoalIndexEntry } from '../../shared/goal-types';
import { createGoalPaths, type GoalPaths } from './goal-paths';

export interface GoalStoreIo {
  read<T>(file: string): Promise<T | null>;
  write<T>(file: string, data: T): Promise<void>;
}

export interface GoalStore {
  list(): Promise<Goal[]>;
  get(goalId: string): Promise<Goal | null>;
  /** The goal a session drives, if any. A session drives at most one goal. */
  forSession(sessionPath: string): Promise<Goal | null>;
  put(goal: Goal): Promise<void>;
}

function summarize(goal: Goal): GoalIndexEntry {
  return {
    id: goal.id,
    objective: goal.objective,
    status: goal.status,
    sessionPath: goal.sessionPath,
    sessionId: goal.sessionId,
    automaticTurns: goal.usage.automaticTurns,
    maxAutomaticTurns: goal.limits.maxAttemptsTotal,
    costUsd: goal.usage.costUsd,
    pauseReason: goal.pauseReason,
    waitReason: goal.wait?.reason,
    blockReason: goal.block?.reason,
    limitReached: goal.limitReached,
    closedAt: goal.closedAt,
    updatedAt: goal.updatedAt,
  };
}

/**
 * A session drives at most one goal, but a finished goal keeps its record. A
 * completed or stopped goal is no longer live, so the session may start another
 * without the old record standing in the way.
 */
function isLive(goal: Goal): boolean {
  return goal.status !== 'complete' && goal.closedAt === undefined;
}

export function createGoalStore(io: GoalStoreIo, stateDir: string, paths: GoalPaths = createGoalPaths(stateDir)): GoalStore {
  let cache: Map<string, Goal> | null = null;
  let loading: Promise<Map<string, Goal>> | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Map<string, Goal>> {
    const index = await io.read<GoalIndex>(paths.index);
    const loaded = new Map<string, Goal>();
    for (const entry of index?.goals ?? []) {
      const goal = await io.read<Goal>(paths.goal(entry.id));
      if (goal) loaded.set(goal.id, goal);
    }
    return loaded;
  }

  async function ensureLoaded(): Promise<Map<string, Goal>> {
    if (cache) return cache;
    loading ??= load();
    cache = await loading;
    return cache;
  }

  /** Serializes writes; a failure does not poison the queue for later writes. */
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function writeIndex(goals: Map<string, Goal>): Promise<void> {
    const index: GoalIndex = {
      schemaVersion: 1,
      goals: [...goals.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summarize),
    };
    await io.write(paths.index, index);
  }

  return {
    async list() {
      return [...(await ensureLoaded()).values()];
    },

    async get(goalId) {
      return (await ensureLoaded()).get(goalId) ?? null;
    },

    async forSession(sessionPath) {
      const goals = [...(await ensureLoaded()).values()].filter(
        (goal) => goal.sessionPath === sessionPath && isLive(goal),
      );
      // Newest first, so a replacement goal wins over an older parked one.
      goals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return goals[0] ?? null;
    },

    async put(goal) {
      const goals = await ensureLoaded();
      return serialize(async () => {
        goals.set(goal.id, goal);
        await io.write(paths.goal(goal.id), goal);
        await writeIndex(goals);
      });
    },
  };
}
