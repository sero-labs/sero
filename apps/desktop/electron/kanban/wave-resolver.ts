/**
 * Wave resolver — groups subtasks into dependency-ordered execution waves.
 *
 * Subtasks within a wave have all their dependencies satisfied and can
 * be executed in parallel. Waves are executed sequentially.
 *
 * Example:
 *   Subtask 1: dependsOn []     → Wave 1
 *   Subtask 2: dependsOn [1]    → Wave 2
 *   Subtask 3: dependsOn [1]    → Wave 2  (parallel with 2)
 *   Subtask 4: dependsOn [2, 3] → Wave 3
 */

import type { Subtask } from './types';

/**
 * Resolve subtasks into execution waves based on their dependency graph.
 *
 * @returns Array of waves, where each wave is an array of subtask IDs
 *          that can be executed in parallel.
 */
export function resolveExecutionWaves(subtasks: Subtask[]): string[][] {
  if (subtasks.length === 0) return [];

  const waves: string[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(subtasks.map((s) => s.id));
  const depsMap = new Map<string, string[]>();

  for (const st of subtasks) {
    // Filter out dependencies that don't exist (defensive)
    const validDeps = st.dependsOn.filter((dep) => remaining.has(dep));
    depsMap.set(st.id, validDeps);
  }

  let safetyCounter = 0;
  const maxIterations = subtasks.length + 1;

  while (remaining.size > 0 && safetyCounter < maxIterations) {
    safetyCounter++;

    // Find all subtasks whose dependencies are fully completed
    const ready: string[] = [];
    for (const id of remaining) {
      const deps = depsMap.get(id) ?? [];
      if (deps.every((dep) => completed.has(dep))) {
        ready.push(id);
      }
    }

    if (ready.length === 0) {
      // Circular dependency or unreachable — force remaining into final wave
      console.warn(
        `[wave-resolver] Circular/unresolvable deps detected for: [${[...remaining].join(', ')}]. Forcing execution.`,
      );
      waves.push([...remaining]);
      break;
    }

    waves.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      completed.add(id);
    }
  }

  return waves;
}
