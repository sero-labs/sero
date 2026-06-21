import { describe, expect, it } from 'vitest';
import { computeReadySteps, dependenciesSatisfied, validateRuntime } from '../readiness';
import type { Loop, StepOutcome } from '../../shared/types';
import { parallelPlan, sequentialPlan } from './fixtures';

function loopFromPlan(plan: Loop['plan']): Loop {
  const stepStates: Loop['runtime']['stepStates'] = {};
  for (const step of plan.steps) stepStates[step.id] = { status: 'pending', attempts: 0, updatedAt: 't' };
  return {
    id: 'l', workspaceId: 'ws', title: 't', prompt: 'p', summary: '', status: 'active',
    workspace: { useManagedWorktree: true, reuseExistingWorktree: true, dirtyWorkspacePromptTimeoutMs: 0, dirtyWorkspaceDefaultAction: 'create-managed-worktree' },
    plan, runtime: { parentSessionId: 'pid', variables: {}, stepStates, workspace: {} },
    triggers: [], limits: { maxConcurrentSteps: 5 }, logPolicy: { retainRuns: 5, retainArtifacts: true, maxInlineOutputBytes: 100 },
    warnings: [], runs: [], revisions: [], createdAt: 't', updatedAt: 't',
  };
}

function succeed(loop: Loop, stepId: string): Loop {
  const outcome: StepOutcome = { status: 'succeeded', summary: 'ok' };
  return { ...loop, runtime: { ...loop.runtime, stepStates: { ...loop.runtime.stepStates, [stepId]: { status: 'succeeded', attempts: 1, outcome, updatedAt: 't' } } } };
}

describe('computeReadySteps', () => {
  it('only the first step is ready in a sequential plan', () => {
    const loop = loopFromPlan(sequentialPlan().plan);
    expect(computeReadySteps(loop)).toEqual(['a']);
  });

  it('dependent steps do not become ready until dependencies succeed', () => {
    let loop = loopFromPlan(sequentialPlan().plan);
    expect(computeReadySteps(loop)).toEqual(['a']);
    loop = succeed(loop, 'a');
    expect(computeReadySteps(loop)).toEqual(['b']);
  });

  it('independent steps both become ready', () => {
    let loop = loopFromPlan(parallelPlan().plan);
    expect(computeReadySteps(loop)).toEqual(['root']);
    loop = succeed(loop, 'root');
    expect(computeReadySteps(loop)).toEqual(['left', 'right']);
  });

  it('respects per-step attempt limits', () => {
    const loop = loopFromPlan(sequentialPlan().plan);
    const capped: Loop = {
      ...loop,
      limits: { ...loop.limits, maxAttemptsPerStep: 2 },
      runtime: { ...loop.runtime, stepStates: { ...loop.runtime.stepStates, a: { status: 'pending', attempts: 2, updatedAt: 't' } } },
    };
    expect(computeReadySteps(capped)).toEqual([]);
  });
});

describe('dependenciesSatisfied', () => {
  it('is false when a dependency has not succeeded', () => {
    const loop = loopFromPlan(sequentialPlan().plan);
    expect(dependenciesSatisfied(loop, loop.plan.steps[1])).toBe(false);
  });
});

describe('validateRuntime', () => {
  it('passes for a well-formed loop', () => {
    expect(validateRuntime(loopFromPlan(sequentialPlan().plan)).ok).toBe(true);
  });
  it('fails when a step is missing runtime state', () => {
    const loop = loopFromPlan(sequentialPlan().plan);
    delete loop.runtime.stepStates.b;
    const result = validateRuntime(loop);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing runtime state');
  });
});
