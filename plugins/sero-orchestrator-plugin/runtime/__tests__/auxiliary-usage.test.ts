import { describe, expect, it, vi } from 'vitest';
import { Coordinator } from '../coordinator';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { llmDecider, llmEvaluator } from '../llm-decisions';
import { runTrackedModel, loopUsageSink } from '../usage-tracking';
import { reportedUsage } from '../../shared/usage';
import { toRunSummary } from '../store';
import { createFakeHost } from './fake-host';
import { oneStepPlan, planJson, seedActiveLoop } from './fixtures';

const usage = (costUsd: number) => ({ inputTokens: 10, outputTokens: 5, totalTokens: 115, costUsd });

describe('planning and auxiliary accounting', () => {
  it('persists planner, repair and trigger costs once across live and final reports', async () => {
    const host = createFakeHost();
    const responses = ['invalid', planJson(oneStepPlan()), JSON.stringify({ recurring: false, schedule: null, events: [] })];
    let calls = 0;
    host.runStructured = async (params) => {
      const index = calls++;
      const priced = usage((index + 1) / 10);
      params.onUsage?.(priced);
      params.onUsage?.(priced);
      return { response: responses[index], usage: priced };
    };
    const result = await new Coordinator(host).requestAction({ kind: 'create', prompt: 'one small task' });
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
    expect(host.state.loops[0].planningUsage?.costUsd).toBeCloseTo(0.6);
    expect(result.loop?.planningUsage).toEqual(host.state.loops[0].planningUsage);
    expect(reportedUsage(result.loop?.planningUsage)?.incomplete).toBeUndefined();
  });

  it('records uncertainty before the first report and clears it only after final usage', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    host.runStructured = async () => { await gate; return { response: 'done', usage: usage(0.2) }; };
    const running = runTrackedModel(host, { task: 'work', parentSessionId: 'p' }, loopUsageSink(host, loop.id, 'planningUsage'));
    await vi.waitFor(() => expect(reportedUsage(host.state.loops[0].planningUsage)?.incomplete).toBe(true));
    const interrupted = structuredClone(host.state.loops[0]);
    release();
    await running;
    expect(reportedUsage(interrupted.planningUsage)?.incomplete).toBe(true);
    expect(reportedUsage(host.state.loops[0].planningUsage)).toMatchObject({ costUsd: 0.2 });
    expect(reportedUsage(host.state.loops[0].planningUsage)?.incomplete).toBeUndefined();
  });

  it('retains live priced usage when the final report is missing', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.runStructured = async (params) => {
      params.onUsage?.(usage(0.1));
      params.onUsage?.(usage(0.2));
      params.onUsage?.(usage(0.1));
      return { response: 'done' };
    };
    const result = await runTrackedModel(host, { task: 'work', parentSessionId: 'p' }, loopUsageSink(host, loop.id, 'auxiliaryUsage'));
    expect(result.usage).toMatchObject({ costUsd: 0.2, incomplete: true });
    expect(reportedUsage(host.state.loops[0].auxiliaryUsage)).toMatchObject({ costUsd: 0.2, incomplete: true });
  });

  it('keeps a concurrent charge when a revision saves its older loop snapshot', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.runStructured = async (params) => {
      params.onUsage?.(usage(0.2));
      await loopUsageSink(host, loop.id, 'auxiliaryUsage')(usage(0.3));
      return { response: JSON.stringify({ goal: loop.prompt, plan: loop.plan }), usage: usage(0.2) };
    };
    const result = await new Coordinator(host).requestAction({ kind: 'revise', loopId: loop.id, prompt: 'Keep the same goal' });
    expect(result.ok).toBe(true);
    expect(host.state.loops[0].planningUsage?.costUsd).toBeCloseTo(0.2);
    expect(host.state.loops[0].auxiliaryUsage?.costUsd).toBeCloseTo(0.3);
  });

  it('includes evaluator repair and recovery calls in the durable run total', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push(
      { response: 'invalid', usage: usage(0.1) },
      { response: JSON.stringify({ status: 'failed', summary: 'needs repair' }), usage: usage(0.2) },
      { response: JSON.stringify({ decision: 'block-loop', reason: 'review' }), usage: usage(0.3) },
    );
    await new RunEngine(host, {
      locks: new LoopLocks(), evaluator: llmEvaluator, decider: llmDecider,
      executor: { async run(input) { return {
        id: 'worker', stepId: input.step.id, attemptNumber: 1, parentSessionId: 'p',
        executionType: 'background-agent', status: 'completed', observations: [], startedAt: host.now(), usage: usage(0.01),
      }; } },
    }).run('loop-1');
    const run = host.state.loops[0].runs[0];
    expect(run.auxiliaryUsage?.costUsd).toBeCloseTo(0.6);
    expect(toRunSummary(run).usage?.costUsd).toBeCloseTo(0.61);
    expect(toRunSummary(run).usage?.incomplete).toBeUndefined();
  });
});
