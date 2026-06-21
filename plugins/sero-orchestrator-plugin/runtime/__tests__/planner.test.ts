import { describe, expect, it } from 'vitest';
import { planLoop } from '../planner';
import { createFakeHost } from './fake-host';
import { oneStepPlan, parallelPlan, planJson, sequentialPlan } from './fixtures';

const req = { prompt: 'do something', parentSessionId: 'orchestrator:ws-1:loop-1' };

describe('planLoop', () => {
  it('returns a validated one-step plan', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.response.plan.steps).toHaveLength(1);
  });

  it('handles sequential and parallel plans', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(sequentialPlan()) });
    const seq = await planLoop(host, req);
    expect(seq.ok).toBe(true);

    host.modelResponses.push({ response: planJson(parallelPlan()) });
    const par = await planLoop(host, req);
    expect(par.ok).toBe(true);
  });

  it('uses a pure model call (no platform tools) with the loop parent session id', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    await planLoop(host, req);
    expect(host.modelCalls[0].platformTools).toBe('none');
    expect(host.modelCalls[0].parentSessionId).toBe('orchestrator:ws-1:loop-1');
  });

  it('repairs once when the first response is invalid', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ not json' });
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(true);
    expect(host.modelCalls).toHaveLength(2);
    expect(host.modelCalls[1].task).toContain('failed structural validation');
  });

  it('gives up with errors after a failed repair', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ not json' });
    host.modelResponses.push({ response: '{"title":"x","summary":"y","plan":{"objective":"o","steps":[]}}' });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors.length).toBeGreaterThan(0);
    expect(host.modelCalls).toHaveLength(2);
  });

  it('surfaces model call failures', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '', error: 'model exploded' });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors[0]).toContain('model exploded');
  });
});
