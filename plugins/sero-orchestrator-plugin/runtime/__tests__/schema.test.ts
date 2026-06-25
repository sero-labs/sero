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
  it('rejects a flat multi-step plan where every step is a final step', () => {
    const errors = validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'model' } },
      { id: 'b', title: 'B', instructions: 'i', execution: { type: 'model' } },
    ]));
    expect(errors.some((e) => e.includes('exactly one final step'))).toBe(true);
  });
  it('accepts a multi-step plan that funnels to one final step', () => {
    expect(validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'model' } },
      { id: 'b', title: 'B', instructions: 'i', dependsOn: ['a'], execution: { type: 'model' } },
    ]))).toEqual([]);
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
  it('chains a bare ordered object list with no dependencies into a sequence (the live failure case)', () => {
    // The exact shape the live model produced: ordered step objects, no ids, no dependsOn.
    const result = validatePlanningResponse({
      plan: [
        { title: 'Inspect', instructions: 'Find the text.' },
        { title: 'Edit', instructions: 'Make it blue.' },
        { title: 'Finalize', instructions: 'Verify and emit completion.' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const steps = result.value.plan.steps;
      expect(steps[0].dependsOn).toBeUndefined();
      expect(steps[1].dependsOn).toEqual([steps[0].id]);
      expect(steps[2].dependsOn).toEqual([steps[1].id]);
      // Funnels to exactly one final step, so structural validation passes.
      expect(validateLoopPlan(result.value.plan)).toEqual([]);
    }
  });
  it('respects explicit dependencies and does not force-chain them', () => {
    const result = validatePlanningResponse({
      plan: [
        { id: 'root', title: 'Root', instructions: 'seed' },
        { id: 'a', title: 'A', instructions: 'branch a', dependsOn: ['root'] },
        { id: 'b', title: 'B', instructions: 'branch b', dependsOn: ['root'] },
        { id: 'join', title: 'Join', instructions: 'combine', dependsOn: ['a', 'b'] },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plan.steps[1].dependsOn).toEqual(['root']); // not re-chained to step 0
      expect(result.value.plan.steps[2].dependsOn).toEqual(['root']);
    }
  });
  it('accepts a plain string array as the plan (the live failure case)', () => {
    const result = validatePlanningResponse({
      plan: [
        'Locate the text in the codebase.',
        'Update the styling so it renders red.',
        'Verify the change.',
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plan.steps).toHaveLength(3);
      // Ordered string list becomes a sequential plan.
      expect(result.value.plan.steps[0].dependsOn).toBeUndefined();
      expect(result.value.plan.steps[1].dependsOn).toEqual([result.value.plan.steps[0].id]);
      expect(result.value.plan.steps[2].dependsOn).toEqual([result.value.plan.steps[1].id]);
      expect(result.value.plan.steps[0].execution.type).toBe('background-agent');
    }
  });
  it('defaults a missing title rather than failing a sound plan', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'o', steps: [{ id: 's1', title: 'S1', instructions: 'go', execution: { type: 'model' } }] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe('Untitled loop');
  });
});
