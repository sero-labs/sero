import { describe, expect, it } from 'vitest';
import type { EngineDeps } from '../engine-types';
import type { LoopPlan, StepOutcome } from '../../shared/types';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { rearmLoop } from '../scheduler';
import { buildStepTask } from '../executors/prompt';
import { retryStuckLoop } from '../recovery-apply';
import { fakeDecider, fakeExecutor } from './engine-fakes';
import { createFakeHost } from './fake-host';
import { seedActiveLoop } from './fixtures';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'done' };

function feedbackPlan(maxTraversalsPerRun = 2): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'implement and verify',
    steps: [
      { id: 'prepare', title: 'Prepare', instructions: 'prepare', execution: { type: 'model' }, produces: ['outside'] },
      { id: 'implement', title: 'Implement', instructions: 'implement', dependsOn: ['prepare'], execution: { type: 'background-agent' }, produces: ['draftRoute'] },
      {
        id: 'verify', title: 'Verify', instructions: 'verify', dependsOn: ['implement'], execution: { type: 'background-agent' }, produces: ['route'],
        feedback: { id: 'verify-fix', toStepId: 'implement', when: { var: 'route', in: ['needs-fix'] }, maxTraversalsPerRun },
      },
      { id: 'finalise', title: 'Finalise', instructions: 'finish', dependsOn: ['verify'], execution: { type: 'model' } },
    ],
  };
}

function deps(executor: EngineDeps['executor'], decision: 'wait' | 'retry-step' = 'wait'): EngineDeps {
  return { executor, decider: fakeDecider({ decision }), locks: new LoopLocks() };
}

describe('RunEngine bounded feedback', () => {
  it('revisits the region, records distinct visits, clears stale region variables, and later exits', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, feedbackPlan());
    let verifies = 0;
    const revisitVariables: Record<string, unknown>[] = [];
    const implementTasks: string[] = [];
    const executor = fakeExecutor({
      prepare: { status: 'succeeded', summary: 'prepared', variables: { outside: 'keep' } },
      implement: (input) => {
        revisitVariables.push({ ...input.loop.runtime.variables });
        implementTasks.push(buildStepTask(input.loop, input.step, input.run));
        return { status: 'succeeded', summary: 'implemented', variables: { draftRoute: 'old' } };
      },
      verify: () => {
        verifies += 1;
        return { status: 'succeeded', summary: 'verified', variables: { route: verifies === 1 ? 'needs-fix' : 'passed' } };
      },
      finalise: { status: 'succeeded', summary: 'finished', completion: { status: 'complete', reason: 'verified' } },
    });

    await new RunEngine(host, deps(executor)).run('loop-1');
    const loop = host.state.loops[0];
    const run = loop.runs[0];
    expect(executor.calls).toEqual(['prepare', 'implement', 'verify', 'implement', 'verify', 'finalise']);
    expect(run.stepActivations?.map((activation) => `${activation.stepId}#${activation.visitNumber}`)).toEqual([
      'prepare#1', 'implement#1', 'verify#1', 'implement#2', 'verify#2', 'finalise#1',
    ]);
    expect(new Set(run.stepAttempts.map((attempt) => attempt.activationId)).size).toBe(6);
    expect(loop.runtime.feedbackStates?.['verify-fix'].traversals).toBe(1);
    expect(revisitVariables[1]).toEqual({ outside: 'keep' });
    expect(implementTasks[0]).not.toContain('FEEDBACK REVISIT');
    expect(implementTasks[1]).toContain('FEEDBACK REVISIT #1');
    expect(implementTasks[1]).toContain('Source outcome: verified');
    expect(implementTasks[1]).toContain('"route": "needs-fix"');
    expect(loop.status).toBe('complete');
  });

  it('keeps a recovery retry on the same activation and makes feedback a new visit', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, feedbackPlan());
    let verifies = 0;
    const executor = fakeExecutor({
      prepare: SUCCESS,
      implement: SUCCESS,
      verify: () => {
        verifies += 1;
        if (verifies === 1) return { status: 'failed', summary: 'transient' };
        return { status: 'succeeded', summary: 'checked', variables: { route: verifies === 2 ? 'needs-fix' : 'passed' } };
      },
      finalise: { status: 'succeeded', summary: 'finished', completion: { status: 'complete', reason: 'done' } },
    });
    const engineDeps = deps(executor, 'retry-step');
    await new RunEngine(host, engineDeps).run('loop-1');
    const run = host.state.loops[0].runs[0];
    const verifyActivations = run.stepActivations!.filter((activation) => activation.stepId === 'verify');
    expect(verifyActivations.map((activation) => activation.attemptIds.length)).toEqual([2, 1]);
    expect(verifyActivations.map((activation) => activation.visitNumber)).toEqual([1, 2]);
  });

  it('routes traversal exhaustion through needs-revision recovery without exceeding the bound', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, feedbackPlan(1));
    const executor = fakeExecutor({
      prepare: SUCCESS,
      implement: SUCCESS,
      verify: { status: 'succeeded', summary: 'still broken', variables: { route: 'needs-fix' } },
    });
    await new RunEngine(host, deps(executor)).run('loop-1');
    const loop = host.state.loops[0];
    expect(executor.calls).toEqual(['prepare', 'implement', 'verify', 'implement', 'verify']);
    expect(loop.runtime.feedbackStates?.['verify-fix'].traversals).toBe(1);
    expect(loop.runtime.stepStates.verify.status).toBe('needs-revision');
    expect(loop.runs[0].recoveryDecisions).toHaveLength(1);
    expect(loop.runs[0].stepAttempts.at(-1)?.outcome?.summary).toContain('is exhausted');
  });

  it('preserves the exhausted traversal count when recovery starts another run', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, feedbackPlan(1));
    const executor = fakeExecutor({
      prepare: SUCCESS,
      implement: SUCCESS,
      verify: { status: 'succeeded', summary: 'still broken', variables: { route: 'needs-fix' } },
    });
    const engine = new RunEngine(host, deps(executor));

    await engine.run('loop-1');
    const retried = retryStuckLoop(host.state.loops[0], host.now())!;
    host.state = { ...host.state, loops: [retried] };
    await engine.run('loop-1');

    expect(executor.calls).toEqual(['prepare', 'implement', 'verify', 'implement', 'verify', 'verify']);
    expect(host.state.loops[0].runtime.feedbackStates?.['verify-fix'].traversals).toBe(1);
    expect(host.state.loops[0].runs[1].stepAttempts.at(-1)?.outcome?.summary).toContain('is exhausted');
  });

  it('traverses feedback when recovery accepts a corrected matching outcome', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, feedbackPlan());
    let verifies = 0;
    const executor = fakeExecutor({
      prepare: SUCCESS,
      implement: SUCCESS,
      verify: () => {
        verifies += 1;
        return verifies === 1
          ? { status: 'failed', summary: 'misreported' }
          : { status: 'succeeded', summary: 'verified', variables: { route: 'passed' } };
      },
      finalise: { status: 'succeeded', summary: 'finished', completion: { status: 'complete', reason: 'done' } },
    });
    const engineDeps: EngineDeps = {
      executor,
      decider: fakeDecider({
        decision: 'accept-step',
        acceptedOutcome: { status: 'succeeded', summary: 'needs another pass', variables: { route: 'needs-fix' } },
      }),
      locks: new LoopLocks(),
    };

    await new RunEngine(host, engineDeps).run('loop-1');

    const loop = host.state.loops[0];
    const verifyActivations = loop.runs[0].stepActivations!.filter((activation) => activation.stepId === 'verify');
    expect(executor.calls).toEqual(['prepare', 'implement', 'verify', 'implement', 'verify', 'finalise']);
    expect(loop.runtime.feedbackStates?.['verify-fix'].traversals).toBe(1);
    expect(verifyActivations.map((activation) => activation.outcome?.status)).toEqual(['succeeded', 'succeeded']);
  });

  it('starts a recurring run with fresh traversal state', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, feedbackPlan());
    loop.runtime.feedbackStates = { 'verify-fix': { traversals: 2 } };
    expect(rearmLoop(loop, host.now()).runtime.feedbackStates).toBeUndefined();
  });
});
