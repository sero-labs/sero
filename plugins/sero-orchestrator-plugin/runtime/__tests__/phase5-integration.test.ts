import { describe, expect, it } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import type { LoopPlan, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const json = (value: unknown) => JSON.stringify(value);
const failed = (summary = 'it failed'): string => json({ status: 'failed', summary } satisfies StepOutcome);
const succeeded = (summary = 'ok'): string => json({ status: 'succeeded', summary } satisfies StepOutcome);

function engineFor(host: FakeHost): RunEngine {
  return new RunEngine(host, createEngineDeps(new LoopLocks()));
}

function loopOf(host: FakeHost) {
  return host.state.loops[0];
}

describe('Phase 5 — outcomes, recovery, completion', () => {
  it('a failed step is revised by the LLM and then succeeds', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: failed() },
      { response: json({ decision: 'revise-step', reason: 'fix', revisedStep: { id: 'step-1', title: 'Fixed', instructions: 'better', execution: { type: 'background-agent' } } }) },
      { response: succeeded() },
    );
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.plan.steps[0].title).toBe('Fixed');
    expect(loop.runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('a failed step leads to new steps via revise-plan', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const revisedPlan: LoopPlan = {
      schemaVersion: 1, revision: 0, objective: 'o',
      steps: [
        { id: 'step-1', title: 'orig', instructions: 'x', execution: { type: 'background-agent' } },
        { id: 'step-2', title: 'Added', instructions: 'do the new thing', execution: { type: 'model' } },
      ],
    };
    host.modelResponses.push(
      { response: failed() },
      { response: json({ decision: 'revise-plan', reason: 'need another step', revisedPlan }) },
      { response: succeeded('new step done') },
    );
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.plan.steps.map((s) => s.id)).toContain('step-2');
    expect(loop.runtime.stepStates['step-2'].status).toBe('succeeded');
    expect(loop.revisions.some((r) => r.status === 'applied')).toBe(true);
  });

  it('a failed step can be skipped by recovery', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: failed() }, { response: json({ decision: 'skip-step', reason: 'not needed' }) });
    await engineFor(host).run('loop-1');
    expect(loopOf(host).runtime.stepStates['step-1'].status).toBe('skipped');
  });

  it('block-loop recovery blocks with recovery-block', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: failed() }, { response: json({ decision: 'block-loop', reason: 'stuck' }) });
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.status).toBe('blocked');
    expect(loop.runtime.block?.kind).toBe('recovery-block');
  });

  it('a complete set of successes without a completion signal does not complete', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: succeeded() });
    await engineFor(host).run('loop-1');
    expect(loopOf(host).status).toBe('active');
  });

  it('a planned completion signal completes the loop', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: json({ status: 'succeeded', summary: 'validated', completion: { status: 'complete', reason: 'done' } }) });
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.status).toBe('complete');
    expect(loop.runtime.completion?.status).toBe('complete');
  });

  it('evaluates raw output via the LLM when no StepOutcome envelope is present', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: 'I finished the work but did not emit JSON.' }, // executor: no envelope
      { response: succeeded('evaluated as done') }, // evaluator
    );
    await engineFor(host).run('loop-1');
    expect(loopOf(host).runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('rejects and records an invalid revision', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const invalidPlan = { schemaVersion: 1, revision: 0, objective: 'o', steps: [] };
    host.modelResponses.push({ response: failed() }, { response: json({ decision: 'revise-plan', reason: 'bad', revisedPlan: invalidPlan }) });
    const result = await engineFor(host).run('loop-1');
    expect(result.run?.observations.some((o) => o.summary.includes('invalid'))).toBe(true);
    expect(loopOf(host).status).toBe('active'); // not blocked; revision simply rejected
  });
});
