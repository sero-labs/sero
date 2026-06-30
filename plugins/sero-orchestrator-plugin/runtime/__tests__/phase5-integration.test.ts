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
    // Revise-plan replaces the failed approach with a fresh chain that funnels
    // to one final step (step-3), so step-2 then step-3 run in order.
    const revisedPlan: LoopPlan = {
      schemaVersion: 1, revision: 0, objective: 'o',
      steps: [
        { id: 'step-2', title: 'Added', instructions: 'do the new thing', execution: { type: 'model' } },
        { id: 'step-3', title: 'Finalize', instructions: 'wrap up', dependsOn: ['step-2'], execution: { type: 'model' } },
      ],
    };
    host.modelResponses.push(
      { response: failed() },
      { response: json({ decision: 'revise-plan', reason: 'need another step', revisedPlan }) },
      { response: succeeded('new step done') },
      { response: succeeded('finalized') },
    );
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.plan.steps.map((s) => s.id)).toContain('step-2');
    expect(loop.runtime.stepStates['step-2'].status).toBe('succeeded');
    expect(loop.runtime.stepStates['step-3'].status).toBe('succeeded');
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

  it('recovers the live failure: a "completed" status is rejected, the evaluator repairs, and the step succeeds', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      // executor: did the work but reported a near-miss status word, with prose around it
      { response: 'Identified the file.\n```json\n{"status":"completed","summary":"found it"}\n```' },
      { response: json({ status: 'completed', summary: 'found it' }) }, // evaluator mirrors the bad word
      { response: succeeded('found it') }, // evaluator repairs to an allowed value
    );
    await engineFor(host).run('loop-1');
    expect(loopOf(host).runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('accepts a mis-reported step via recovery and marks it succeeded with its variables', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: failed('evaluation could not parse') },
      { response: json({ decision: 'accept-step', reason: 'the work was actually done', acceptedOutcome: { status: 'succeeded', summary: 'really done', variables: { file: 'src/main.tsx' } } }) },
    );
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.runtime.stepStates['step-1'].status).toBe('succeeded');
    expect(loop.runtime.variables.file).toBe('src/main.tsx');
  });

  it('an accept-step outcome that carries completion completes the loop', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: failed() },
      { response: json({ decision: 'accept-step', reason: 'finalization actually passed', acceptedOutcome: { status: 'succeeded', summary: 'verified', completion: { status: 'complete', reason: 'all good' } } }) },
    );
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.status).toBe('complete');
    expect(loop.runtime.completion?.status).toBe('complete');
  });

  function makeRecurring(host: FakeHost, loopId: string) {
    host.state = {
      ...host.state,
      loops: host.state.loops.map((l) =>
        l.id === loopId
          ? { ...l, triggers: [{ id: 't', loopId, workspaceId: host.workspaceId, type: 'cron' as const, schedule: '* * * * *', fireCount: 0, nextFireAt: '2030-01-01T00:00:00.000Z' }] }
          : l,
      ),
    };
  }

  it('a scheduled loop stays active (scheduled) after an ordinary iteration completes', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    makeRecurring(host, 'loop-1');
    host.modelResponses.push({ response: json({ status: 'succeeded', summary: 'iteration done', completion: { status: 'complete', reason: 'this run is done' } }) });
    await engineFor(host).run('loop-1');
    expect(loopOf(host).status).toBe('active'); // re-runs next fire, not terminally complete
    expect(loopOf(host).runtime.completion).toBeUndefined();
  });

  it('a scheduled loop completes for good when the step signals final', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    makeRecurring(host, 'loop-1');
    host.modelResponses.push({ response: json({ status: 'succeeded', summary: 'goal met', completion: { status: 'complete', final: true, reason: 'no open issues remain' } }) });
    await engineFor(host).run('loop-1');
    const loop = loopOf(host);
    expect(loop.status).toBe('complete');
    expect(loop.runtime.completion?.final).toBe(true);
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
