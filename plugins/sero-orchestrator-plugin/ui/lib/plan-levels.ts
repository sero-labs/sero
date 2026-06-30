import type { LoopStepDefinition } from '../../shared/types';

/**
 * Groups plan steps into dependency levels for display. Steps in the same level
 * have no dependency path between them, so they can run at the same time; each
 * later level depends on an earlier one. Order within a level follows the plan.
 *
 * Level of a step = 0 when it has no (in-plan) dependencies, else one more than
 * the deepest of its dependencies. The plan is validated acyclic before it gets
 * here; a cycle would still terminate (treated as level 0) rather than loop.
 */
export function groupStepsByLevel(steps: LoopStepDefinition[]): LoopStepDefinition[][] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const levelById = new Map<string, number>();
  const visiting = new Set<string>();

  const levelOf = (id: string): number => {
    const cached = levelById.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard — should not happen post-validation
    visiting.add(id);
    const deps = (byId.get(id)?.dependsOn ?? []).filter((d) => byId.has(d));
    const level = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(levelOf));
    visiting.delete(id);
    levelById.set(id, level);
    return level;
  };

  const levels: LoopStepDefinition[][] = [];
  for (const step of steps) {
    const level = levelOf(step.id);
    (levels[level] ??= []).push(step);
  }
  return levels.filter((group) => group && group.length > 0);
}
