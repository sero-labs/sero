import { describe, expect, it } from 'vitest';
import { runPlanningWithRetry } from '../planning-retry';
import { createFakeHost } from './fake-host';

const params = { task: 'Plan', parentSessionId: 'test', platformTools: 'none' as const };

describe('planning retry', () => {
  it('stops after two retries instead of retrying indefinitely', async () => {
    const host = createFakeHost();
    host.modelResponses.push(...Array.from({ length: 3 }, () => ({ response: '', error: 'HTTP 503' })));
    expect((await runPlanningWithRetry(host, params)).error).toBe('HTTP 503');
    expect(host.modelCalls).toHaveLength(3);
  });

  it('does not start a call after cancellation', async () => {
    const host = createFakeHost();
    const controller = new AbortController();
    controller.abort();
    await expect(runPlanningWithRetry(host, { ...params, signal: controller.signal })).rejects.toThrow();
    expect(host.modelCalls).toHaveLength(0);
  });

  it('recovers from a temporary service rejection without changing the model', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '', error: 'HTTP 503' }, { response: 'plan' });
    expect((await runPlanningWithRetry(host, { ...params, model: 'anthropic/test' })).response).toBe('plan');
    expect(host.modelCalls.map((call) => call.model)).toEqual(['anthropic/test', 'anthropic/test']);
  });

  it('does not retry permission failures or partially billed calls', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '', error: 'HTTP 401' });
    expect((await runPlanningWithRetry(host, params)).error).toBe('HTTP 401');
    expect(host.modelCalls).toHaveLength(1);
    host.modelResponses.push({ response: 'partial', error: 'HTTP 503' });
    expect((await runPlanningWithRetry(host, params)).response).toBe('partial');
    expect(host.modelCalls).toHaveLength(2);
  });

  it('never replays a tool-enabled agent through the planning retry path', async () => {
    const host = createFakeHost();
    await expect(runPlanningWithRetry(host, { ...params, platformTools: 'all' })).rejects.toThrow('tool-free');
    expect(host.modelCalls).toHaveLength(0);
  });
});
