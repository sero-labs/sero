import { describe, expect, it, vi } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { backgroundAgentExecutor } from '../executors/background-agent';
import { reconcileLoop } from '../reconcile';
import { aggregateUsage } from '../../shared/usage';
import { formatLoopUsage, summarizeLoopUsage } from '../../ui/lib/usage-summary';
import { toRunSummary } from '../store';
import { createFakeHost } from './fake-host';
import { fakeDecider } from './engine-fakes';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 1030, costUsd: 0.012 };

function setup(fanOut = false) {
  const host = createFakeHost();
  const plan = oneStepPlan().plan;
  if (fanOut) plan.steps[0].fanOut = { itemsFrom: 'items', itemVariable: 'item', maxItems: 2, maxConcurrency: 2, overflow: 'block' };
  const loop = seedActiveLoop(host, plan);
  loop.runtime.variables = { items: ['a', 'b'] };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  host.runStructured = async (params) => {
    params.onUsage?.(usage);
    params.onUsage?.(usage);
    await gate;
    return { response: JSON.stringify({ status: 'succeeded', summary: 'done' }), usage };
  };
  const engine = new RunEngine(host, { executor: backgroundAgentExecutor, decider: fakeDecider({ decision: 'wait' }), locks: new LoopLocks() });
  return { host, loop, release, engine };
}

describe('durable worker usage', () => {
  it.each([false, true])('saves cumulative spend before completion and counts it once (fan-out: %s)', async (fanOut) => {
    const { host, loop, release, engine } = setup(fanOut);
    const running = engine.run(loop.id);
    const count = fanOut ? 2 : 1;
    await vi.waitFor(() => {
      const attempts = host.state.loops[0].runs[0]?.stepAttempts ?? [];
      expect(attempts.filter((attempt) => attempt.usage?.costUsd === usage.costUsd)).toHaveLength(count);
    });
    const saved = structuredClone(host.state.loops[0]);
    const liveUsage = aggregateUsage(saved.runs[0].stepAttempts);
    expect(liveUsage?.costUsd).toBeCloseTo(usage.costUsd * count);
    expect(liveUsage?.incomplete).toBe(true);
    const restarted = reconcileLoop(host, saved);
    expect(restarted.runs[0].stepAttempts.every((attempt) => attempt.status === 'orphaned')).toBe(true);
    expect(aggregateUsage(restarted.runs[0].stepAttempts)).toEqual(liveUsage);
    const summary = summarizeLoopUsage([toRunSummary(restarted.runs[0])], loop.limits);
    expect(formatLoopUsage(summary!)).toContain('usage incomplete');

    release();
    await running;
    const finished = host.state.loops[0].runs[0];
    expect(finished.stepAttempts.filter((attempt) => !attempt.synthetic)).toHaveLength(count);
    expect(aggregateUsage(finished.stepAttempts)?.costUsd).toBeCloseTo(usage.costUsd * count);
    expect(aggregateUsage(finished.stepAttempts)?.incomplete).toBeUndefined();
  });
});
