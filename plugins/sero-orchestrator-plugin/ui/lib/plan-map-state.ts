import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';

export type MapRouteState = 'undecided' | 'taken' | 'not-taken';

export function mapRouteState(loop: Loop, step: LoopStepDefinition): MapRouteState {
  const runtimeStatus = loop.runtime.stepStates[step.id]?.status;
  if (runtimeStatus === 'skipped') return 'not-taken';
  if (!step.when) return 'taken';

  const value = loop.runtime.variables[step.when.var];
  if (value === undefined) return 'undecided';
  if (step.when.in) return step.when.in.includes(value as string | number | boolean) ? 'taken' : 'not-taken';

  const siblingMatched = loop.plan.steps.some((candidate) =>
    candidate.id !== step.id
    && candidate.when?.var === step.when?.var
    && candidate.when?.in?.includes(value as string | number | boolean),
  );
  return siblingMatched ? 'not-taken' : 'taken';
}

export function mapEdgeState(loop: Loop, fromStepId: string, toStepId: string): StepStatus {
  const target = loop.runtime.stepStates[toStepId]?.status;
  const source = loop.runtime.stepStates[fromStepId]?.status;
  if (target === 'skipped') return 'skipped';
  if (target === 'failed' || target === 'blocked' || target === 'needs-revision') return target;
  if (target === 'running' || source === 'running') return 'running';
  if (target === 'succeeded') return 'succeeded';
  return target ?? source ?? 'pending';
}
