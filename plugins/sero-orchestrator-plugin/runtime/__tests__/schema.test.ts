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
  it('rejects step ids that are not safe path slugs (artifact paths use the id)', () => {
    for (const badId of ['../../outside/file', 'a/b', 'with space', '..', 'tab\tname']) {
      const errors = validateLoopPlan(plan([
        { id: badId, title: 'X', instructions: 'i', execution: { type: 'model' } },
      ]));
      expect(errors.some((e) => e.includes('must be a slug'))).toBe(true);
    }
  });
  it('accepts ordinary slug step ids', () => {
    expect(validateLoopPlan(plan([
      { id: 'step-1_final', title: 'X', instructions: 'i', execution: { type: 'model' } },
    ]))).toEqual([]);
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
  it('accepts a background-agent step with a tools allowlist', () => {
    expect(validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'background-agent', tools: ['bash', 'read', 'web_search'] } },
    ]))).toEqual([]);
  });
  it('rejects execution.tools that is not an array of non-empty strings', () => {
    const errors = validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'background-agent', tools: ['bash', ''] } as never },
    ]));
    expect(errors.some((e) => e.includes('execution.tools must be an array'))).toBe(true);
  });
  it('accepts a background-agent step with a named agent role', () => {
    expect(validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'background-agent', agent: 'reviewer' } },
    ]))).toEqual([]);
  });
  it('rejects execution.agent that is not a non-empty string', () => {
    const errors = validateLoopPlan(plan([
      { id: 'a', title: 'A', instructions: 'i', execution: { type: 'background-agent', agent: '' } as never },
    ]));
    expect(errors.some((e) => e.includes('execution.agent must be a non-empty'))).toBe(true);
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
  it('rejects a cron trigger with an invalid schedule (forces repair)', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'o', steps: [{ id: 's1', title: 'S', instructions: 'go', execution: { type: 'background-agent' } }] },
      suggestedTriggers: [{ type: 'cron', schedule: 'every 10 minutes' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('cron'))).toBe(true);
  });

  it('accepts a valid cron trigger', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'o', steps: [{ id: 's1', title: 'S', instructions: 'go', execution: { type: 'background-agent' } }] },
      suggestedTriggers: [{ type: 'cron', schedule: '*/10 * * * *' }],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a valid event trigger (known source, flat filter, bounded condition)', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'o', steps: [{ id: 's1', title: 'S', instructions: 'go', execution: { type: 'background-agent' } }] },
      suggestedTriggers: [
        {
          type: 'event',
          eventSource: 'github:ci-failed',
          eventFilter: { repo: 'sero', branch: ['main', 'dev'] },
          eventCondition: 'the failing PR was opened by this loop',
          debounceMs: 60_000,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an event trigger without a known namespaced eventSource', () => {
    const base = { plan: { objective: 'o', steps: [{ id: 's1', title: 'S', instructions: 'go', execution: { type: 'background-agent' } }] } };
    const missing = validatePlanningResponse({ ...base, suggestedTriggers: [{ type: 'event' }] });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.some((e) => e.includes('eventSource'))).toBe(true);

    const unknown = validatePlanningResponse({ ...base, suggestedTriggers: [{ type: 'event', eventSource: 'jira:ticket-changed' }] });
    expect(unknown.ok).toBe(false);

    const malformed = validatePlanningResponse({ ...base, suggestedTriggers: [{ type: 'event', eventSource: 'no-namespace' }] });
    expect(malformed.ok).toBe(false);
  });

  it('rejects a non-flat eventFilter, an oversized condition, and a negative debounce', () => {
    const base = { plan: { objective: 'o', steps: [{ id: 's1', title: 'S', instructions: 'go', execution: { type: 'background-agent' } }] } };
    const nested = validatePlanningResponse({
      ...base,
      suggestedTriggers: [{ type: 'event', eventSource: 'fs:changed', eventFilter: { nested: { deep: true } } }],
    });
    expect(nested.ok).toBe(false);
    if (!nested.ok) expect(nested.errors.some((e) => e.includes('eventFilter'))).toBe(true);

    const oversized = validatePlanningResponse({
      ...base,
      suggestedTriggers: [{ type: 'event', eventSource: 'fs:changed', eventCondition: 'x'.repeat(501) }],
    });
    expect(oversized.ok).toBe(false);

    const negative = validatePlanningResponse({
      ...base,
      suggestedTriggers: [{ type: 'event', eventSource: 'fs:changed', debounceMs: -5 }],
    });
    expect(negative.ok).toBe(false);
  });

  it('a hybrid trigger needs BOTH a valid cron half and a valid event half', () => {
    const base = { plan: { objective: 'o', steps: [{ id: 's1', title: 'S', instructions: 'go', execution: { type: 'background-agent' } }] } };
    const ok = validatePlanningResponse({
      ...base,
      suggestedTriggers: [{ type: 'hybrid', schedule: '0 8 * * *', eventSource: 'github:pr-opened' }],
    });
    expect(ok.ok).toBe(true);

    const noEvent = validatePlanningResponse({ ...base, suggestedTriggers: [{ type: 'hybrid', schedule: '0 8 * * *' }] });
    expect(noEvent.ok).toBe(false);
  });

  it('defaults a missing title rather than failing a sound plan', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'o', steps: [{ id: 's1', title: 'S1', instructions: 'go', execution: { type: 'model' } }] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe('Untitled loop');
  });
});

describe('validateLoopPlan — branching guards', () => {
  const work = (id: string, deps: string[], extra: Partial<LoopStepDefinition> = {}): LoopStepDefinition =>
    ({ id, title: id, instructions: 'x', execution: { type: 'background-agent' }, dependsOn: deps, ...extra });

  it('accepts a guard whose variable is produced by a dependency-ancestor', () => {
    const errors = validateLoopPlan(plan([
      { id: 'judge', title: 'J', instructions: 'decide', execution: { type: 'model' }, produces: ['route'] },
      work('a', ['judge'], { when: { var: 'route', in: ['x'] } }),
      work('end', ['a']),
    ]));
    expect(errors).toEqual([]);
  });

  it('rejects a guard whose variable is not produced upstream', () => {
    const errors = validateLoopPlan(plan([
      { id: 'judge', title: 'J', instructions: 'decide', execution: { type: 'model' } },
      work('a', ['judge'], { when: { var: 'route', in: ['x'] } }),
      work('end', ['a']),
    ]));
    expect(errors.some((e) => e.includes('not produced by any upstream step'))).toBe(true);
  });

  it('rejects a guard with both in and default, or neither', () => {
    const both = validateLoopPlan(plan([
      { id: 'judge', title: 'J', instructions: 'd', execution: { type: 'model' }, produces: ['route'] },
      work('a', ['judge'], { when: { var: 'route', in: ['x'], default: true } }),
      work('end', ['a']),
    ]));
    expect(both.some((e) => e.includes('exactly one of'))).toBe(true);

    const neither = validateLoopPlan(plan([
      { id: 'judge', title: 'J', instructions: 'd', execution: { type: 'model' }, produces: ['route'] },
      work('a', ['judge'], { when: { var: 'route' } }),
      work('end', ['a']),
    ]));
    expect(neither.some((e) => e.includes('exactly one of'))).toBe(true);
  });

  it('rejects a malformed produces declaration', () => {
    const errors = validateLoopPlan(plan([
      { id: 'judge', title: 'J', instructions: 'd', execution: { type: 'model' }, produces: [''] },
      work('end', ['judge']),
    ]));
    expect(errors.some((e) => e.includes('produces must be'))).toBe(true);
  });

  it('accepts a planner-shaped branching response and preserves produces/when', () => {
    const result = validatePlanningResponse({
      plan: { objective: 'route the work', steps: [
        { id: 'judge', title: 'Judge', instructions: 'decide route', execution: { type: 'model' }, produces: ['route'] },
        { id: 'simple', title: 'Simple', instructions: 'implement', execution: { type: 'background-agent' }, dependsOn: ['judge'], when: { var: 'route', in: ['simple'] } },
        { id: 'complex', title: 'Complex', instructions: 'plan then implement', execution: { type: 'background-agent' }, dependsOn: ['judge'], when: { var: 'route', in: ['complex'] } },
        { id: 'fallback', title: 'Fallback', instructions: 'safe default', execution: { type: 'background-agent' }, dependsOn: ['judge'], when: { var: 'route', default: true } },
        { id: 'finalize', title: 'Finalize', instructions: 'confirm and complete', execution: { type: 'model' }, dependsOn: ['simple', 'complex', 'fallback'] },
      ] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const byId = (id: string) => result.value.plan.steps.find((s) => s.id === id)!;
      expect(byId('judge').produces).toEqual(['route']);
      expect(byId('simple').when).toEqual({ var: 'route', in: ['simple'] });
      expect(byId('fallback').when).toEqual({ var: 'route', default: true });
    }
  });
});
