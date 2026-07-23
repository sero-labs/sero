/** Engine integration for bounded dynamic fan-out (specs/17-dynamic-fan-out.md). */

import { describe, expect, it } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { FanOutAggregate, LoopPlan, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { seedActiveLoop } from './fixtures';
import { fakeDecider, fakeExecutor, type OutcomeSpec } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };
const AREAS = [
  { id: 'runtime', focus: 'scheduling' },
  { id: 'ui', focus: 'plan view' },
  { id: 'shared', focus: 'types' },
];
const IDENTIFIED: StepOutcome = { status: 'succeeded', summary: 'found areas', variables: { scoutAreas: AREAS } };

function fanOutPlan(patch: { maxConcurrency?: number; produces?: string[] } = {}): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'Scout and combine',
    steps: [
      {
        id: 'identify',
        title: 'Identify areas',
        instructions: 'Record variables.scoutAreas.',
        produces: patch.produces ?? ['scoutAreas'],
        execution: { type: 'background-agent' },
      },
      {
        id: 'scout',
        title: 'Scout one area',
        instructions: 'Scout variables.scoutArea.',
        dependsOn: ['identify'],
        fanOut: { itemsFrom: 'scoutAreas', itemVariable: 'scoutArea', itemKey: 'id', maxItems: 10, maxConcurrency: patch.maxConcurrency, overflow: 'block' },
        execution: { type: 'background-agent' },
      },
      {
        id: 'combine',
        title: 'Combine findings',
        instructions: 'Combine results.',
        dependsOn: ['scout'],
        execution: { type: 'background-agent' },
      },
    ],
  };
}

function deps(partial: Partial<EngineDeps>): EngineDeps {
  return {
    executor: partial.executor ?? fakeExecutor({}),
    decider: partial.decider ?? fakeDecider({ decision: 'wait' }),
    locks: partial.locks ?? new LoopLocks(),
    evaluator: partial.evaluator,
  };
}

function loopOf(host: FakeHost) {
  return host.state.loops.find((l) => l.id === 'loop-1')!;
}

describe('fan-out engine integration', () => {
  it('expands the collection into one activation per item and aggregates for the join step', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, fanOutPlan());
    let combineSawAggregate: FanOutAggregate | undefined;
    const executor = fakeExecutor({
      identify: IDENTIFIED,
      scout: (input) => ({
        status: 'succeeded',
        summary: `scouted ${input.fanOut!.key}`,
        variables: { findings: [`finding for ${(input.fanOut!.item as { id: string }).id}`] },
      }),
      combine: (input) => {
        combineSawAggregate = input.loop.runtime.variables.scoutAreasResults as FanOutAggregate;
        return SUCCESS;
      },
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');

    const loop = loopOf(host);
    expect(executor.calls).toEqual(['identify', 'scout', 'scout', 'scout', 'combine']);
    expect(loop.runtime.stepStates.scout.status).toBe('succeeded');
    expect(loop.runtime.stepStates.combine.status).toBe('succeeded');

    const run = loop.runs[0];
    const activations = (run.stepActivations ?? []).filter((a) => a.stepId === 'scout' && a.fanOut);
    expect(activations.map((a) => a.fanOut!.key)).toEqual(['runtime', 'ui', 'shared']);
    expect(activations.every((a) => a.status === 'succeeded')).toBe(true);
    expect(activations.map((a) => a.id)).toEqual(AREAS.map((area) => `${run.id}:scout:${area.id}`));

    const state = loop.runtime.fanOutStates?.scout;
    expect(state?.manifest).toMatchObject({ runId: run.id, stepId: 'scout', sourceVariable: 'scoutAreas', itemCount: 3 });
    expect(state?.aggregate).toMatchObject({ total: 3, succeeded: 3, partial: false });

    expect(combineSawAggregate?.results.map((r) => r.key)).toEqual(['runtime', 'ui', 'shared']);
    expect(combineSawAggregate?.results[0].variables).toEqual({ findings: ['finding for runtime'] });
  });

  it('passes each activation its own item and variable name', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, fanOutPlan());
    const seen: { key: string; index: number; total: number; itemVariable: string }[] = [];
    const executor = fakeExecutor({
      identify: IDENTIFIED,
      scout: (input) => {
        const { key, index, total, itemVariable } = input.fanOut!;
        seen.push({ key, index, total, itemVariable });
        return SUCCESS;
      },
      combine: SUCCESS,
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    expect(seen).toEqual([
      { key: 'runtime', index: 0, total: 3, itemVariable: 'scoutArea' },
      { key: 'ui', index: 1, total: 3, itemVariable: 'scoutArea' },
      { key: 'shared', index: 2, total: 3, itemVariable: 'scoutArea' },
    ]);
  });

  it('runs activations in bounded waves under maxConcurrency', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, fanOutPlan({ maxConcurrency: 2 }));
    let inFlight = 0;
    let maxInFlight = 0;
    const executor = fakeExecutor({
      identify: {
        status: 'succeeded',
        summary: 'found areas',
        variables: { scoutAreas: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })) },
      },
      scout: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return SUCCESS;
      },
      combine: SUCCESS,
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    expect(executor.calls.filter((id) => id === 'scout')).toHaveLength(5);
    expect(maxInFlight).toBe(2);
    expect(loopOf(host).runtime.stepStates.combine.status).toBe('succeeded');
  });

  it('recovery retry re-runs only the failed activation, preserving succeeded siblings', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, fanOutPlan());
    const failOnce = new Set(['ui']);
    const executor = fakeExecutor({
      identify: IDENTIFIED,
      scout: (input) => {
        const key = input.fanOut!.key;
        if (failOnce.delete(key)) return { status: 'failed', summary: `transient error in ${key}` };
        return { status: 'succeeded', summary: `scouted ${key}` };
      },
      combine: SUCCESS,
    });
    await new RunEngine(host, deps({ executor, decider: fakeDecider({ decision: 'retry-step' }) })).run('loop-1');

    const loop = loopOf(host);
    // 3 first-wave activations + exactly 1 retry (the failed sibling only).
    expect(executor.calls.filter((id) => id === 'scout')).toHaveLength(4);
    expect(loop.runtime.stepStates.scout.status).toBe('succeeded');
    expect(loop.runtime.stepStates.combine.status).toBe('succeeded');
    const aggregate = loop.runtime.fanOutStates?.scout?.aggregate;
    expect(aggregate).toMatchObject({ total: 3, succeeded: 3, failed: 0, partial: false });
    // The retried activation kept its identity and carries both attempts.
    const ui = (loop.runs[0].stepActivations ?? []).find((a) => a.fanOut?.key === 'ui')!;
    expect(ui.status).toBe('succeeded');
    expect(ui.attemptIds).toHaveLength(2);
  });

  it('blocks without starting any activation when the collection exceeds maxItems', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, fanOutPlan());
    const executor = fakeExecutor({
      identify: {
        status: 'succeeded',
        summary: 'found too many',
        variables: { scoutAreas: Array.from({ length: 12 }, (_, i) => ({ id: `area-${i}` })) },
      },
    });
    await new RunEngine(host, deps({ executor, decider: fakeDecider({ decision: 'block-loop' }) })).run('loop-1');

    const loop = loopOf(host);
    expect(executor.calls).toEqual(['identify']); // no scout activation ever started
    expect(loop.runtime.stepStates.scout.status).toBe('blocked');
    expect(loop.runtime.stepStates.scout.outcome?.summary).toContain('at most 10');
    expect(loop.runtime.stepStates.scout.outcome?.summary).toContain('area-0');
    expect(loop.status).toBe('blocked');
    expect((loop.runs[0].stepActivations ?? []).filter((a) => a.stepId === 'scout')).toEqual([]);
  });

  it('blocks when the source variable is missing or below minItems', async () => {
    const host = createFakeHost();
    const plan = fanOutPlan({ produces: [] }); // no produces → route contract stays out of the way
    seedActiveLoop(host, plan);
    const executor = fakeExecutor({ identify: { status: 'succeeded', summary: 'forgot to record' } });
    await new RunEngine(host, deps({ executor, decider: fakeDecider({ decision: 'block-loop' }) })).run('loop-1');
    const loop = loopOf(host);
    expect(loop.runtime.stepStates.scout.status).toBe('blocked');
    expect(loop.runtime.stepStates.scout.outcome?.summary).toContain('never recorded');
  });

  it('parks the loop when an activation asks the user, keeping siblings settled', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, fanOutPlan());
    const executor = fakeExecutor({
      identify: IDENTIFIED,
      scout: (input) =>
        input.fanOut!.key === 'ui'
          ? { status: 'needs-revision', summary: 'need a decision', questions: [{ id: 'q1', prompt: 'Which panel?' }] }
          : SUCCESS,
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');

    const loop = loopOf(host);
    expect(loop.runtime.pendingInput?.stepId).toBe('scout');
    expect(loop.runtime.stepStates.scout.status).toBe('pending'); // re-runs after the answer
    const activations = loop.runs[0].stepActivations ?? [];
    expect(activations.find((a) => a.fanOut?.key === 'ui')?.status).toBe('pending');
    expect(activations.find((a) => a.fanOut?.key === 'runtime')?.status).toBe('succeeded');
    expect(activations.find((a) => a.fanOut?.key === 'shared')?.status).toBe('succeeded');
  });

  it('skips a guarded fan-out step whose route was not taken (no manifest created)', async () => {
    const host = createFakeHost();
    const plan = fanOutPlan();
    plan.steps[0].produces = ['route', 'scoutAreas'];
    plan.steps[1].when = { var: 'route', in: ['needs-scouting'] };
    seedActiveLoop(host, plan);
    const executor = fakeExecutor({
      identify: { status: 'succeeded', summary: 'no scouting needed', variables: { route: 'skip', scoutAreas: [] } },
      combine: SUCCESS,
    });
    await new RunEngine(host, deps({ executor })).run('loop-1');

    const loop = loopOf(host);
    expect(executor.calls).toEqual(['identify', 'combine']);
    expect(loop.runtime.stepStates.scout.status).toBe('skipped');
    expect(loop.runtime.fanOutStates).toBeUndefined();
    expect(loop.runtime.stepStates.combine.status).toBe('succeeded');
  });
});
