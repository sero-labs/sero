import { describe, expect, it } from 'vitest';
import { mergeStepOverride, replayStepOverrides } from '../library-overlay';
import type { LoopPlan } from '../../shared/types';

describe('mergeStepOverride', () => {
  it('records and merges per-step picks', () => {
    const a = mergeStepOverride(undefined, 's1', { model: 'HIGH', thinking: 'high' });
    expect(a).toEqual({ s1: { model: 'HIGH', thinking: 'high' } });
    const b = mergeStepOverride(a, 's1', { tools: ['grep'] });
    expect(b).toEqual({ s1: { model: 'HIGH', thinking: 'high', tools: ['grep'] } });
  });

  it('clearing a field drops it, and an emptied entry is removed', () => {
    const a = mergeStepOverride(undefined, 's1', { model: 'HIGH' });
    const cleared = mergeStepOverride(a, 's1', { model: undefined, thinking: undefined });
    expect(cleared).toBeUndefined();
  });

  it('keeps other steps when one is cleared', () => {
    let ov = mergeStepOverride(undefined, 's1', { model: 'HIGH' });
    ov = mergeStepOverride(ov, 's2', { tools: ['web_search'] });
    ov = mergeStepOverride(ov, 's1', { model: undefined, thinking: undefined });
    expect(ov).toEqual({ s2: { tools: ['web_search'] } });
  });
});

const PLAN: LoopPlan = {
  schemaVersion: 1,
  revision: 0,
  objective: 'o',
  steps: [
    { id: 'a', title: 'A', instructions: 'a', execution: { type: 'background-agent', model: 'MED' } },
    { id: 'b', title: 'B', instructions: 'b', execution: { type: 'model', model: 'MED' } },
  ],
};

describe('replayStepOverrides', () => {
  it('returns the plan unchanged when there are no overrides', () => {
    expect(replayStepOverrides(PLAN, undefined)).toEqual({ plan: PLAN, dropped: [] });
  });

  it('applies local picks over the version values', () => {
    const { plan, dropped } = replayStepOverrides(PLAN, { a: { model: 'HIGH', tools: ['grep'] }, b: { model: 'LOW' } });
    expect(plan.steps[0].execution).toMatchObject({ type: 'background-agent', model: 'HIGH', tools: ['grep'] });
    expect(plan.steps[1].execution).toMatchObject({ type: 'model', model: 'LOW' });
    expect(dropped).toEqual([]);
  });

  it('reports overrides for steps absent in the new plan', () => {
    const { dropped } = replayStepOverrides(PLAN, { a: { model: 'HIGH' }, gone: { model: 'LOW' } });
    expect(dropped).toEqual(['gone']);
  });
});
