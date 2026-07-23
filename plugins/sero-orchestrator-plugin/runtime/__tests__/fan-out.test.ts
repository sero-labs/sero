import { describe, expect, it } from 'vitest';
import type { FanOutManifest, Loop, LoopRun, LoopStepDefinition, StepActivation } from '../../shared/types';
import { buildFanOutAggregate, expandFanOut, fanOutJoinOutcome } from '../fan-out';

const NOW = '2026-01-01T00:00:00.000Z';

function step(fanOut: Partial<LoopStepDefinition['fanOut']> = {}): LoopStepDefinition {
  return {
    id: 'scout',
    title: 'Scout',
    instructions: 'x',
    execution: { type: 'background-agent' },
    fanOut: { itemsFrom: 'areas', itemVariable: 'area', maxItems: 5, ...fanOut },
  };
}

function loopWith(variables: Record<string, unknown>): Loop {
  return { runtime: { variables } } as unknown as Loop;
}

const run = { id: 'run-1' } as LoopRun;

describe('expandFanOut', () => {
  it('expands an array into an index-keyed manifest when no itemKey is set', () => {
    const result = expandFanOut(loopWith({ areas: ['a', 'b'] }), run, step(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.itemCount).toBe(2);
    expect(result.manifest.items.map((i) => i.key)).toEqual(['0', '1']);
    expect(result.manifest.items[0].activationId).toBe('run-1:scout:0');
    expect(result.manifest.sourceVariable).toBe('areas');
  });

  it('reads and normalises itemKey fields into safe activation keys', () => {
    const areas = [{ id: 'Runtime Core!' }, { id: 'ui/panels' }];
    const result = expandFanOut(loopWith({ areas }), run, step({ itemKey: 'id' }), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.items.map((i) => i.key)).toEqual(['Runtime-Core', 'ui-panels']);
  });

  it('rejects duplicate keys with both item indices named', () => {
    const areas = [{ id: 'same' }, { id: 'same' }];
    const result = expandFanOut(loopWith({ areas }), run, step({ itemKey: 'id' }), NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('duplicate activation key "same"');
    expect(result.reason).toContain('items 0 and 1');
  });

  it('rejects a missing, non-array, undersized, or oversized source', () => {
    expect(expandFanOut(loopWith({}), run, step(), NOW)).toMatchObject({ ok: false, reason: expect.stringContaining('never recorded') });
    expect(expandFanOut(loopWith({ areas: 'nope' }), run, step(), NOW)).toMatchObject({ ok: false, reason: expect.stringContaining('must be an array') });
    expect(expandFanOut(loopWith({ areas: [] }), run, step(), NOW)).toMatchObject({ ok: false, reason: expect.stringContaining('below the required minimum') });
    const oversized = expandFanOut(loopWith({ areas: ['a', 'b', 'c'] }), run, step({ maxItems: 2 }), NOW);
    expect(oversized).toMatchObject({ ok: false, reason: expect.stringContaining('at most 2') });
    if (!oversized.ok) expect(oversized.reason).toContain('0, 1, 2'); // key sample in the report
  });

  it('rejects items without a usable itemKey field', () => {
    const result = expandFanOut(loopWith({ areas: ['plain-string'] }), run, step({ itemKey: 'id' }), NOW);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('no usable "id" key') });
  });
});

function activation(id: string, status: StepActivation['status'], summary = 's', variables?: Record<string, unknown>): StepActivation {
  return { id, stepId: 'scout', visitNumber: 1, status, attemptIds: [], outcome: { status: status as never, summary, variables }, startedAt: NOW };
}

const manifest: FanOutManifest = {
  runId: 'run-1',
  stepId: 'scout',
  sourceVariable: 'areas',
  createdAt: NOW,
  itemCount: 2,
  items: [
    { activationId: 'run-1:scout:a', key: 'a', index: 0, item: 'A' },
    { activationId: 'run-1:scout:b', key: 'b', index: 1, item: 'B' },
  ],
};

describe('fan-out aggregation', () => {
  it('joins all-settled activations into a succeeded outcome with the results variable', () => {
    const aggregate = buildFanOutAggregate(manifest, [
      activation('run-1:scout:a', 'succeeded', 'found things', { findings: ['f1'] }),
      activation('run-1:scout:b', 'skipped'),
    ]);
    expect(aggregate).toMatchObject({ total: 2, succeeded: 1, skipped: 1, failed: 0, partial: false });
    expect(aggregate.results[0]).toMatchObject({ key: 'a', status: 'succeeded', variables: { findings: ['f1'] } });

    const outcome = fanOutJoinOutcome(step(), aggregate);
    expect(outcome.status).toBe('succeeded');
    expect(outcome.variables?.areasResults).toEqual(aggregate);
  });

  it('joins a failure into a failed outcome naming the unsettled keys', () => {
    const aggregate = buildFanOutAggregate(manifest, [
      activation('run-1:scout:a', 'succeeded'),
      activation('run-1:scout:b', 'failed', 'boom'),
    ]);
    expect(aggregate).toMatchObject({ succeeded: 1, failed: 1, partial: true });
    expect(aggregate.results[1].error).toBe('boom');

    const outcome = fanOutJoinOutcome(step(), aggregate);
    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('b: failed');
    expect(outcome.variables).toBeUndefined();
  });
});
