import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import { formatDuration } from './format';

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

/**
 * How long a step's newest finished attempt took, for the plan map card. A step
 * that is still running has no elapsed time yet, so the card shows none rather
 * than a number that goes stale between renders.
 */
export function stepElapsedLabel(loop: Loop, stepId: string): string | undefined {
  for (let index = loop.runs.length - 1; index >= 0; index -= 1) {
    const attempt = loop.runs[index].stepAttempts
      .filter((candidate) => candidate.stepId === stepId && !candidate.synthetic && candidate.endedAt)
      .at(-1);
    if (!attempt?.endedAt) continue;
    const elapsed = new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime();
    return Number.isFinite(elapsed) && elapsed >= 0 ? formatDuration(elapsed) : undefined;
  }
  return undefined;
}
