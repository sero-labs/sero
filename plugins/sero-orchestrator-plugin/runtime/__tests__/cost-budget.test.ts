import { describe, expect, it } from 'vitest';
import { mergeLimits } from '../loop-factory';
import { Coordinator } from '../coordinator';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { createFakeHost } from './fake-host';
import { fakeDecider, fakeExecutor } from './engine-fakes';
import { seedActiveLoop, sequentialPlan } from './fixtures';

describe('cost-based workflow limits', () => {
  it('keeps a live cap change through progress writes and stops before the next paid step', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    loop.limits.maxCostUsd = 4.5;
    const coordinator = new Coordinator(host);
    const executor = fakeExecutor({ a: { status: 'succeeded', summary: 'first done' } });
    const engine = new RunEngine(host, {
      locks: new LoopLocks(), decider: fakeDecider({ decision: 'wait' }),
      executor: { run: async (input) => {
        const attempt = { ...await executor.run(input), usage: { costUsd: 1 } };
        expect((await coordinator.requestAction({ kind: 'use_cost_budget', loopId: loop.id, maxCostUsd: 0.3 })).ok).toBe(true);
        await input.onAttempt?.({ ...attempt, status: 'running' });
        expect(host.state.loops[0].limits.maxCostUsd).toBe(0.3);
        return attempt;
      } },
    });
    await engine.run(loop.id);
    expect(executor.calls).toEqual(['a']);
    expect(host.state.loops[0]).toMatchObject({
      limits: { maxCostUsd: 0.3 }, status: 'blocked',
      runtime: { block: { kind: 'management-limit', limit: 'maxCostUsd' }, stepStates: { a: { status: 'succeeded' }, b: { status: 'pending' } } },
    });
  });

  it('migrates an existing token-blocked workflow without resetting completed work or dollar limits', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    loop.status = 'blocked';
    loop.limits = { maxCostUsd: 4, maxTotalTokens: 50000, maxAttemptsTotal: 50 };
    loop.runtime.block = { kind: 'management-limit', limit: 'maxTotalTokens', reason: 'token cap', createdAt: host.now() };
    loop.runtime.stepStates.a = { status: 'succeeded', attempts: 1, updatedAt: host.now() };
    const result = await new Coordinator(host).requestAction({ kind: 'use_cost_budget', loopId: loop.id });
    expect(result.ok).toBe(true);
    expect(host.state.loops[0].status).toBe('active');
    expect(host.state.loops[0].limits).toEqual({ maxCostUsd: 4, maxAttemptsTotal: 50 });
    expect(host.state.loops[0].runtime.stepStates.a.status).toBe('succeeded');
    expect(host.state.loops[0].runtime.block).toBeUndefined();
  });

  it('raises an exhausted dollar cap without resetting completed steps or other limits', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    loop.status = 'blocked';
    loop.limits = { maxCostUsd: 1, maxAttemptsTotal: 20 };
    loop.runtime.block = { kind: 'management-limit', limit: 'maxCostUsd', reason: 'cost cap', createdAt: host.now() };
    loop.runtime.stepStates.a = { status: 'succeeded', attempts: 1, updatedAt: host.now() };
    const coordinator = new Coordinator(host);
    expect((await coordinator.requestAction({ kind: 'use_cost_budget', loopId: loop.id, maxCostUsd: Infinity })).ok).toBe(false);
    expect(host.state.loops[0].limits.maxCostUsd).toBe(1);
    expect((await coordinator.requestAction({ kind: 'use_cost_budget', loopId: loop.id, maxCostUsd: 2 })).ok).toBe(true);
    expect(host.state.loops[0]).toMatchObject({ status: 'active', limits: { maxCostUsd: 2, maxAttemptsTotal: 20 }, runtime: { stepStates: { a: { status: 'succeeded', attempts: 1 } } } });
    expect(host.state.loops[0].runtime.block).toBeUndefined();
  });

  it('removes the token cap without removing the approved cost or execution safeguards', () => {
    const limits = mergeLimits({ maxTotalTokens: 50000, maxCostUsd: 20 }, { maxCostUsd: 4, maxWallClockMs: 1800000, maxAttemptsTotal: 10 }, true);
    expect(limits.maxTotalTokens).toBeUndefined();
    expect(limits.maxCostUsd).toBe(4);
    expect(limits.maxWallClockMs).toBe(1800000);
    expect(limits.maxAttemptsTotal).toBe(10);
  });

  it('keeps explicit token limits for workflows that did not opt into cost-based limits', () => {
    expect(mergeLimits({}, { maxTotalTokens: 150000 }).maxTotalTokens).toBe(150000);
  });
});
