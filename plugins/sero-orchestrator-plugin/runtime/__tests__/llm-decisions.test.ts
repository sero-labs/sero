import { describe, expect, it } from 'vitest';
import { llmDecider, llmEvaluator, proposeRevisedPlan } from '../llm-decisions';
import type { StepAttempt, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, planJson, seedActiveLoop } from './fixtures';

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

  it('falls back to failed when evaluation is unparseable', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'not json' });
    const outcome = await llmEvaluator.evaluate({ host, loop, step: loop.plan.steps[0], attempt: attempt(host) });
    expect(outcome.status).toBe('failed');
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

  it('falls back to block-loop when the decision is unparseable', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'gibberish' });
    const decision = await llmDecider.decide({ host, loop, step: loop.plan.steps[0], attempt: attempt(host), outcome });
    expect(decision.decision).toBe('block-loop');
  });
});

describe('proposeRevisedPlan', () => {
  it('returns a parsed plan', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: planJson(oneStepPlan()).replace('"One step loop"', '"x"') });
    const proposal = await proposeRevisedPlan(host, loop, 'add a finalization step');
    expect(proposal.plan).toBeTruthy();
  });

  it('reports an error for non-JSON', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'nope' });
    const proposal = await proposeRevisedPlan(host, loop);
    expect(proposal.error).toBeTruthy();
  });
});
