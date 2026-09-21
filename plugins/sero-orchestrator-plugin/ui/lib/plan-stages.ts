/**
 * The plan's stages: one dependency level each, classified by how its steps
 * relate. Map and Details both draw from this, so a group is a branch in one
 * view exactly when it is a branch in the other.
 *
 * - single: one step on its own
 * - parallel: several steps with no guard, which run together
 * - branch: several steps guarded on one variable, of which one route runs
 * - mixed: several steps where some are guarded and some are not
 */

import type { LoopStepDefinition } from '../../shared/types';
import { groupStepsByLevel } from './plan-levels';

export interface PlanStageStep {
  step: LoopStepDefinition;
  /** The step's position in the plan, counted from 1. */
  number: number;
}

export interface PlanStage {
  kind: 'single' | 'parallel' | 'branch' | 'mixed';
  /** The variable a branch stage's guards test. */
  branchVar?: string;
  steps: PlanStageStep[];
}

export function planStages(steps: LoopStepDefinition[]): PlanStage[] {
  const numberById = new Map(steps.map((step, index) => [step.id, index + 1]));
  return groupStepsByLevel(steps).map((level) => {
    const guarded = level.filter((step) => step.when);
    const branchVars = new Set(guarded.flatMap((step) => step.when ? [step.when.var] : []));
    const oneBranch = guarded.length === level.length && branchVars.size === 1;
    let kind: PlanStage['kind'] = 'single';
    if (level.length > 1) {
      if (oneBranch) kind = 'branch';
      else if (guarded.length === 0) kind = 'parallel';
      else kind = 'mixed';
    }
    return {
      kind,
      branchVar: oneBranch ? guarded[0].when?.var : undefined,
      steps: level.map((step) => ({ step, number: numberById.get(step.id)! })),
    };
  });
}

const routeText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * What a group of steps is called, above the group. A branch names the value
 * that chose its route, once one has.
 */
export function stageLabel(
  kind: Exclude<PlanStage['kind'], 'single'>,
  branchVar: string | undefined,
  steps: number,
  variables: Record<string, unknown>,
): string {
  if (kind === 'branch') {
    const chosen = branchVar ? variables[branchVar] : undefined;
    return `Branch · ${branchVar}${chosen === undefined ? ' (not decided yet)' : ` = ${routeText(chosen)}`}`;
  }
  if (kind === 'mixed') return `Same stage · ${steps} steps`;
  return `Run together · ${steps} steps`;
}
