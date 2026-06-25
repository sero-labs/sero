import { describe, expect, it } from 'vitest';
import { llmDecider, llmEvaluator, proposeRevisedPlan } from '../llm-decisions';
import type { StepAttempt, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

function attempt(host: FakeHost): StepAttempt {
  return {
    id: 'att-1', stepId: 'step-1', attemptNumber: 1, parentSessionId: 'p',
    executionType: 'background-agent', status: 'failed', observations: [{ id: 'o', source: 'background-agent', summary: 'raw output here', createdAt: 't' }],
    startedAt: 't', error: 'boom',
  };
}

describe('llmEvaluator', () => {
  it('evaluates raw output into a StepOutcome', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({ status: 'succeeded', summary: 'looks done' } satisfies StepOutcome) });
    const outcome = await llmEvaluator.evaluate({ host, loop, step: loop.plan.steps[0], attempt: attempt(host) });
    expect(outcome.status).toBe('succeeded');
    expect(host.modelCalls[0].platformTools).toBe('none');
  });

  it('rejects a near-miss status and repairs with the exact error fed back', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: JSON.stringify({ status: 'completed', summary: 'x' }) }, // invalid value
      { response: JSON.stringify({ status: 'succeeded', summary: 'x' }) }, // corrected
    );
    const outcome = await llmEvaluator.evaluate({ host, loop, step: loop.plan.steps[0], attempt: attempt(host) });
    expect(outcome.status).toBe('succeeded');
    expect(host.modelCalls.length).toBe(2);
    expect(host.modelCalls[1].task).toContain('succeeded, failed, blocked, skipped, needs-revision');
  });

  it('falls back to failed only after a repair pass also fails', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'not json' }, { response: 'still not json' });
    const outcome = await llmEvaluator.evaluate({ host, loop, step: loop.plan.steps[0], attempt: attempt(host) });
    expect(outcome.status).toBe('failed');
    expect(host.modelCalls.length).toBe(2);
  });
});

describe('llmDecider', () => {
  const outcome: StepOutcome = { status: 'failed', summary: 'it failed' };

  it('parses a recovery decision and records the model response artifact', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({ decision: 'retry-step', reason: 'transient' }) });
    const decision = await llmDecider.decide({ host, loop, step: loop.plan.steps[0], attempt: attempt(host), outcome });
    expect(decision.decision).toBe('retry-step');
    expect(decision.modelResponsePath).toBeTruthy();
  });

  it('falls back to block-loop only after a repair pass also fails', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'gibberish' }, { response: 'still gibberish' });
    const decision = await llmDecider.decide({ host, loop, step: loop.plan.steps[0], attempt: attempt(host), outcome });
    expect(decision.decision).toBe('block-loop');
    expect(host.modelCalls.length).toBe(2);
  });

  it('rejects an unknown decision keyword and repairs with the exact allowed values', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    // The shapes the live model previously reached for: wrong field, shorthand.
    host.modelResponses.push(
      { response: '{"action":"retry","stepId":"step-1","reason":"transient"}' },
      { response: '{"decision":"retry-step","reason":"transient"}' },
    );
    const decision = await llmDecider.decide({ host, loop, step: loop.plan.steps[0], attempt: attempt(host), outcome });
    expect(decision.decision).toBe('retry-step');
    expect(host.modelCalls.length).toBe(2);
    expect(host.modelCalls[1].task).toContain('retry-step, revise-step, revise-plan, skip-step, accept-step, wait, block-loop');
  });

  it('parses an accept-step decision with its corrected outcome', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({
      decision: 'accept-step',
      reason: 'the work was done, only mis-reported',
      acceptedOutcome: { status: 'succeeded', summary: 'found the file' },
    }) });
    const decision = await llmDecider.decide({ host, loop, step: loop.plan.steps[0], attempt: attempt(host), outcome });
    expect(decision.decision).toBe('accept-step');
    expect(decision.acceptedOutcome?.status).toBe('succeeded');
  });

  it('rejects accept-step without a valid acceptedOutcome and repairs', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: JSON.stringify({ decision: 'accept-step', reason: 'done' }) }, // missing acceptedOutcome
      { response: JSON.stringify({ decision: 'accept-step', reason: 'done', acceptedOutcome: { status: 'succeeded', summary: 'ok' } }) },
    );
    const decision = await llmDecider.decide({ host, loop, step: loop.plan.steps[0], attempt: attempt(host), outcome });
    expect(decision.decision).toBe('accept-step');
    expect(host.modelCalls.length).toBe(2);
    expect(host.modelCalls[1].task).toContain('"acceptedOutcome"');
  });
});

describe('proposeRevisedPlan', () => {
  it('returns a parsed plan', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({ ...oneStepPlan().plan, objective: 'revised' }) });
    const proposal = await proposeRevisedPlan(host, loop, 'add a finalization step');
    expect(proposal.plan?.objective).toBe('revised');
  });

  it('reports an error when the revision stays invalid after repair', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'nope' }, { response: 'still nope' });
    const proposal = await proposeRevisedPlan(host, loop);
    expect(proposal.error).toBeTruthy();
    expect(host.modelCalls.length).toBe(2);
  });
});
