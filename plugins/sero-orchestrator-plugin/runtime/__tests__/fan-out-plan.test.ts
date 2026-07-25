import { describe, expect, it } from 'vitest';
import type { FanOutDefinition, LoopPlan, LoopStepDefinition } from '../../shared/types';
import { validateLoopPlan } from '../schema';

function fanOutPlan(fanOut: Partial<FanOutDefinition> = {}, stepPatch: Partial<LoopStepDefinition> = {}): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'Scout and combine',
    steps: [
      {
        id: 'identify',
        title: 'Identify areas',
        instructions: 'Record variables.scoutAreas.',
        produces: ['scoutAreas'],
        execution: { type: 'background-agent' },
      },
      {
        id: 'scout',
        title: 'Scout one area',
        instructions: 'Scout variables.scoutArea.',
        dependsOn: ['identify'],
        fanOut: { itemsFrom: 'scoutAreas', itemVariable: 'scoutArea', itemKey: 'id', maxItems: 10, maxConcurrency: 5, overflow: 'block', ...fanOut },
        execution: { type: 'background-agent' },
        ...stepPatch,
      },
      {
        id: 'combine',
        title: 'Combine findings',
        instructions: 'Combine results.',
        dependsOn: ['scout'],
        execution: { type: 'background-agent' },
      },
    ],
  };
}

describe('fan-out plan validation', () => {
  it('accepts a well-formed fan-out plan', () => {
    expect(validateLoopPlan(fanOutPlan())).toEqual([]);
  });

  it('rejects a missing or out-of-policy maxItems', () => {
    expect(validateLoopPlan(fanOutPlan({ maxItems: undefined as unknown as number })).join(';')).toContain('fanOut.maxItems');
    expect(validateLoopPlan(fanOutPlan({ maxItems: 0 })).join(';')).toContain('fanOut.maxItems');
    expect(validateLoopPlan(fanOutPlan({ maxItems: 51 })).join(';')).toContain('no greater than 50');
  });

  it('rejects minItems above maxItems and negative minItems', () => {
    expect(validateLoopPlan(fanOutPlan({ minItems: 11 })).join(';')).toContain('must not exceed');
    expect(validateLoopPlan(fanOutPlan({ minItems: -1 })).join(';')).toContain('non-negative');
  });

  it('rejects unsupported overflow modes and bad concurrency', () => {
    expect(validateLoopPlan(fanOutPlan({ overflow: 'truncate' as 'block' })).join(';')).toContain('overflow');
    expect(validateLoopPlan(fanOutPlan({ maxConcurrency: 0 })).join(';')).toContain('maxConcurrency');
  });

  it('rejects itemVariable equal to itemsFrom and missing names', () => {
    expect(validateLoopPlan(fanOutPlan({ itemVariable: 'scoutAreas' })).join(';')).toContain('must differ');
    expect(validateLoopPlan(fanOutPlan({ itemsFrom: ' ' })).join(';')).toContain('itemsFrom');
  });

  it('rejects a source variable not produced by a dependency ancestor', () => {
    const errors = validateLoopPlan(fanOutPlan({ itemsFrom: 'unknownList' }));
    expect(errors.join(';')).toContain('not produced by any upstream step');
  });

  it('rejects fan-out on non-background-agent steps', () => {
    const errors = validateLoopPlan(fanOutPlan({}, { execution: { type: 'model' } }));
    expect(errors.join(';')).toContain('only supported on background-agent');
  });

  it('rejects a fan-out step that is also an approval gate or feedback source', () => {
    expect(validateLoopPlan(fanOutPlan({}, { gate: 'approval' })).join(';')).toContain('approval gate');
    const withFeedback = fanOutPlan({}, {
      produces: ['verdict'],
      feedback: { id: 'fb', toStepId: 'identify', when: { var: 'verdict', in: ['retry'] }, maxTraversalsPerRun: 2 },
    });
    expect(validateLoopPlan(withFeedback).join(';')).toContain('cannot also declare a feedback transition');
  });

  it('rejects a fan-out step as the finalization step', () => {
    const plan = fanOutPlan();
    plan.steps = plan.steps.slice(0, 2); // drop the join → scout becomes the sink
    expect(validateLoopPlan(plan).join(';')).toContain('cannot be the finalization step');
  });

  it('rejects a fan-out step inside the bounded feedback region', () => {
    const plan: LoopPlan = {
      schemaVersion: 1,
      revision: 0,
      objective: 'o',
      steps: [
        { id: 'seed', title: 'Seed', instructions: 'Record variables.areas.', produces: ['areas'], execution: { type: 'background-agent' } },
        { id: 'target', title: 'Target', instructions: 't', dependsOn: ['seed'], execution: { type: 'background-agent' } },
        {
          id: 'fan',
          title: 'Fan',
          instructions: 'f',
          dependsOn: ['target'],
          fanOut: { itemsFrom: 'areas', itemVariable: 'area', maxItems: 5 },
          execution: { type: 'background-agent' },
        },
        {
          id: 'verify',
          title: 'Verify',
          instructions: 'v',
          dependsOn: ['fan'],
          produces: ['verdict'],
          feedback: { id: 'fb', toStepId: 'target', when: { var: 'verdict', in: ['retry'] }, maxTraversalsPerRun: 2 },
          execution: { type: 'background-agent' },
        },
        { id: 'final', title: 'Final', instructions: 'x', dependsOn: ['verify'], execution: { type: 'background-agent' } },
      ],
    };
    expect(validateLoopPlan(plan).join(';')).toContain('inside the bounded feedback region');
  });
});
