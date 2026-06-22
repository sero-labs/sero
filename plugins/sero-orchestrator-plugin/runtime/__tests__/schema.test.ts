import { describe, expect, it } from 'vitest';
import { extractJson, findCycle, validateLoopPlan, validatePlanningResponse } from '../schema';
import type { LoopPlan, LoopStepDefinition } from '../../shared/types';
import { oneStepPlan, parallelPlan, sequentialPlan } from './fixtures';

function plan(steps: LoopStepDefinition[]): LoopPlan {
  return { schemaVersion: 1, revision: 0, objective: 'o', steps };
}

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('parses fenced JSON with surrounding prose', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nDone')).toEqual({ a: 1 });
  });
  it('slices to the outermost object when unfenced', () => {
    expect(extractJson('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });
  it('returns undefined for non-JSON', () => {
    expect(extractJson('not json at all')).toBeUndefined();
  });
});

describe('validateLoopPlan', () => {
  it('accepts a one-step plan', () => {
    expect(validateLoopPlan(oneStepPlan().plan)).toEqual([]);
  });
  it('accepts sequential and parallel plans', () => {
    expect(validateLoopPlan(sequentialPlan().plan)).toEqual([]);
    expect(validateLoopPlan(parallelPlan().plan)).toEqual([]);
  });
  it('requires at least one step', () => {
    expect(validateLoopPlan(plan([]))).toContain('plan must contain at least one step');
  });
  it('rejects duplicate ids', () => {
    const errors = validateLoopPlan(plan([
      { id: 'x', title: 'X', instructions: 'i', execution: { type: 'model' } },
      { id: 'x', title: 'X2', instructions: 'i', execution: { type: 'model' } },
    ]));
    expect(errors.some((e) => e.includes('duplicate step id "x"'))).toBe(true);
  });
  it('rejects unknown dependency references', () => {
    const errors = validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', dependsOn: ['ghost'], execution: { type: 'model' } },
    ]));
    expect(errors.some((e) => e.includes('unknown step "ghost"'))).toBe(true);
  });
  it('rejects unsupported execution targets', () => {
    const errors = validateLoopPlan(plan([
      // deliberately invalid execution type
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'telepathy' } as never },
    ]));
    expect(errors.some((e) => e.includes('unsupported execution target'))).toBe(true);
  });
  it('rejects cyclic dependencies', () => {
    const errors = validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', dependsOn: ['b'], execution: { type: 'model' } },
      { id: 'b', title: 'B', instructions: 'i', dependsOn: ['a'], execution: { type: 'model' } },
    ]));
    expect(errors.some((e) => e.includes('cycle'))).toBe(true);
  });
  it('validates active-session targets', () => {
    const errors = validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'active-session' } as never },
    ]));
    expect(errors.some((e) => e.includes('requires a sessionTarget'))).toBe(true);
  });
});

describe('findCycle', () => {
  it('returns null for acyclic graphs', () => {
    expect(findCycle(sequentialPlan().plan.steps)).toBeNull();
  });
  it('returns a path for cyclic graphs', () => {
    const cycle = findCycle([
      { id: 'a', title: 'A', instructions: 'i', dependsOn: ['b'], execution: { type: 'model' } },
      { id: 'b', title: 'B', instructions: 'i', dependsOn: ['a'], execution: { type: 'model' } },
    ]);
    expect(cycle).not.toBeNull();
  });
});

describe('validatePlanningResponse', () => {
  it('normalizes a valid response', () => {
    const result = validatePlanningResponse(oneStepPlan());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
      expect(result.value.plan.steps).toHaveLength(1);
    }
  });
  it('reports a missing plan', () => {
    const result = validatePlanningResponse({ summary: 's', notes: 'nothing here' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('plan is required');
  });

  // Tolerance for real-model shape variants (field-shape only, not meaning).
  it('accepts a flat response with top-level steps (no plan wrapper)', () => {
    const result = validatePlanningResponse({
      title: 'Flat',
      objective: 'do it',
      steps: [{ id: 's1', title: 'S1', instructions: 'go', execution: { type: 'background-agent' } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.plan.steps).toHaveLength(1);
  });
  it('descends a single wrapper key', () => {
    const result = validatePlanningResponse({
      verification_plan: {
        objective: 'o',
        steps: [{ id: 's1', title: 'S1', instructions: 'go', execution: { type: 'model' } }],
      },
    });
    expect(result.ok).toBe(true);
  });
  it('accepts a "workflow" plan alias', () => {
    const result = validatePlanningResponse({
      title: 'Aliased',
      workflow: { objective: 'o', steps: [{ id: 's1', title: 'S1', instructions: 'go', execution: { type: 'model' } }] },
    });
    expect(result.ok).toBe(true);
  });
  it('defaults a missing title rather than failing a sound plan', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'o', steps: [{ id: 's1', title: 'S1', instructions: 'go', execution: { type: 'model' } }] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe('Untitled loop');
  });
});
