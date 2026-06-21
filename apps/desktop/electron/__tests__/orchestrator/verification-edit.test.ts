// Re-derivation reachability — editing a goal's text re-derives its verification
// plan (spec 05), and `replan` forces a fresh plan on the same goal. Closes the
// "built but unreachable" gap: the planner re-runs from a real control action.

import { describe, expect, it } from 'vitest';

import { createHarness, settle } from './harness';
import { goalHash } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { SuccessCriterion } from '@plugins/sero-orchestrator-plugin/shared/types';

const criterion = (description: string): SuccessCriterion => ({
  id: 'c',
  description,
  evidence: [{ kind: 'run', command: 'node test.js' }],
  decision: { kind: 'exit-zero' },
  required: true,
});

/** Derives the plan from the goal text; counts calls. */
function goalPlanner(calls?: { n: number }): PlannerRunner {
  return async (loop) => {
    if (calls) calls.n += 1;
    return { criteria: [criterion(`done: ${loop.goal}`)], stopConditions: [] };
  };
}

describe('edit / replan — re-derivation reachability', () => {
  it('re-derives the plan when the goal text changes', async () => {
    const h = createHarness({ planner: goalPlanner() });
    const id = await h.createLoop({ goal: 'first goal' });
    await settle();
    expect((await h.loop(id))!.verificationPlan!.criteria[0]!.description).toBe('done: first goal');

    const res = await h.coordinator.requestAction({ kind: 'edit', loopId: id, goal: 'second goal' });
    expect(res.ok).toBe(true);
    await settle();

    const loop = await h.loop(id);
    expect(loop!.status).toBe('active');
    expect(loop!.goal).toBe('second goal');
    expect(loop!.verificationPlan!.criteria[0]!.description).toBe('done: second goal');
    expect(loop!.verificationPlan!.derivedFrom.goalHash).toBe(goalHash('second goal'));
    h.cleanup();
  });

  it('does not re-derive when only the title changes', async () => {
    const calls = { n: 0 };
    const h = createHarness({ planner: goalPlanner(calls) });
    const id = await h.createLoop({ title: 'First', goal: 'unchanged' });
    await settle();
    expect(calls.n).toBe(1);

    await h.coordinator.requestAction({ kind: 'edit', loopId: id, title: 'Renamed' });
    await settle();
    const loop = await h.loop(id);
    expect(loop!.title).toBe('Renamed');
    expect(calls.n).toBe(1); // goal unchanged → planner not re-run
    h.cleanup();
  });

  it('replan forces a fresh plan on the same goal', async () => {
    const calls = { n: 0 };
    const planner: PlannerRunner = async () => {
      calls.n += 1;
      return { criteria: [criterion(`v${calls.n}`)], stopConditions: [] };
    };
    const h = createHarness({ planner });
    const id = await h.createLoop();
    await settle();
    expect((await h.loop(id))!.verificationPlan!.criteria[0]!.description).toBe('v1');

    const res = await h.coordinator.requestAction({ kind: 'replan', loopId: id });
    expect(res.ok).toBe(true);
    await settle();
    const loop = await h.loop(id);
    expect(loop!.status).toBe('active');
    expect(loop!.verificationPlan!.criteria[0]!.description).toBe('v2');
    h.cleanup();
  });

  it('refuses to edit a finished goal', async () => {
    const h = createHarness({ planner: goalPlanner() });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'stop', loopId: id });

    const res = await h.coordinator.requestAction({ kind: 'edit', loopId: id, goal: 'too late' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/cannot edit a stopped goal/i);
    h.cleanup();
  });

  it('rejects an edit with neither title nor goal', async () => {
    const h = createHarness({ planner: goalPlanner() });
    const id = await h.createLoop();
    await settle();
    const res = await h.coordinator.requestAction({ kind: 'edit', loopId: id });
    expect(res.ok).toBe(false);
    h.cleanup();
  });
});
