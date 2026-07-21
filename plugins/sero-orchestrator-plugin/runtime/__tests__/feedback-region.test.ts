import { describe, expect, it } from 'vitest';
import type { LoopPlan } from '../../shared/types';
import { computeFeedbackRegion } from '../feedback-region';
import { validateLoopPlan } from '../schema';

function plan(): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'implement and verify',
    steps: [
      { id: 'prepare', title: 'Prepare', instructions: 'prepare', execution: { type: 'model' } },
      { id: 'implement', title: 'Implement', instructions: 'implement', dependsOn: ['prepare'], execution: { type: 'background-agent' } },
      {
        id: 'verify',
        title: 'Verify',
        instructions: 'Record variables.route as passed or needs-fix.',
        dependsOn: ['implement'],
        execution: { type: 'background-agent' },
        produces: ['route'],
        feedback: { id: 'verify-fix', toStepId: 'implement', when: { var: 'route', in: ['needs-fix'] }, maxTraversalsPerRun: 2 },
      },
      { id: 'finalise', title: 'Finalise', instructions: 'finish', dependsOn: ['verify'], execution: { type: 'model' } },
    ],
  };
}

describe('bounded feedback validation', () => {
  it('accepts a bounded single-entry, single-exit region and computes only its steps', () => {
    const candidate = plan();
    expect(validateLoopPlan(candidate)).toEqual([]);
    expect([...computeFeedbackRegion(candidate)!.stepIds]).toEqual(['implement', 'verify']);
  });

  it('rejects malformed declarations and a non-ancestor target', () => {
    const malformed = plan();
    malformed.steps[2].feedback = { id: 'bad/id', toStepId: 'finalise', when: { var: 'route', in: [] }, maxTraversalsPerRun: 0 };
    const errors = validateLoopPlan(malformed).join('\n');
    expect(errors).toContain('feedback.id');
    expect(errors).toContain('positive integer');
    expect(errors).toContain('non-empty array');

    const target = plan();
    target.steps[2].feedback!.toStepId = 'finalise';
    expect(validateLoopPlan(target).join('\n')).toContain('strict dependency ancestor');
  });

  it('rejects multiple transitions, missing source produces, and approval inside the region', () => {
    const multiple = plan();
    multiple.steps[1].produces = ['again'];
    multiple.steps[1].feedback = { id: 'another', toStepId: 'prepare', when: { var: 'again', in: [true] }, maxTraversalsPerRun: 1 };
    expect(validateLoopPlan(multiple).join('\n')).toContain('at most one feedback transition');

    const missingProduces = plan();
    missingProduces.steps[2].produces = [];
    expect(validateLoopPlan(missingProduces).join('\n')).toContain('must be listed');

    const approval = plan();
    approval.steps[1].gate = 'approval';
    expect(validateLoopPlan(approval).join('\n')).toContain('cannot contain approval step');
  });

  it('rejects boundary edges that bypass the target or leave before the source', () => {
    const entry = plan();
    entry.steps.splice(2, 0, { id: 'outside', title: 'Outside', instructions: 'outside', dependsOn: ['prepare'], execution: { type: 'model' } });
    entry.steps.find((step) => step.id === 'verify')!.dependsOn!.push('outside');
    expect(validateLoopPlan(entry).join('\n')).toContain('not single-entry');

    const exit = plan();
    exit.steps.splice(3, 0, { id: 'leak', title: 'Leak', instructions: 'leak', dependsOn: ['implement'], execution: { type: 'model' } });
    exit.steps.find((step) => step.id === 'finalise')!.dependsOn!.push('leak');
    expect(validateLoopPlan(exit).join('\n')).toContain('not single-exit');
  });
});
