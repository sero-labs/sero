import { describe, expect, it } from 'vitest';
import type { LoopRun, StepActivation } from '../../shared/types';
import { fanOutSummaryLabel, fanOutView } from '../lib/fan-out-summary';

function activation(key: string, index: number, status: StepActivation['status'], summary?: string): StepActivation {
  return {
    id: `run-1:scout:${key}`,
    stepId: 'scout',
    visitNumber: 1,
    status,
    fanOut: { index, key, item: key },
    attemptIds: [],
    outcome: summary ? { status: status as never, summary } : undefined,
    startedAt: 't',
  };
}

function runWith(activations: StepActivation[], id = 'run-1'): LoopRun {
  return {
    id,
    runNumber: 1,
    status: 'completed',
    startedStepIds: [],
    stepAttempts: [],
    stepActivations: activations,
    recoveryDecisions: [],
    observations: [],
    startedAt: 't',
  };
}

describe('fanOutView', () => {
  it('summarises the newest run with fan-out activations, in item order', () => {
    const older = runWith([activation('a', 0, 'failed')], 'run-0');
    const newer = runWith([activation('b', 1, 'running'), activation('a', 0, 'succeeded', 'done a')]);
    const view = fanOutView([older, newer], 'scout')!;
    expect(view.items.map((i) => i.key)).toEqual(['a', 'b']);
    expect(view).toMatchObject({ total: 2, succeeded: 1, running: 1, failed: 0 });
    expect(view.items[0].summary).toBe('done a');
  });

  it('folds cancelled/orphaned onto failed and ignores non-fan-out activations', () => {
    const visit: StepActivation = { id: 'run-1:scout:1', stepId: 'scout', visitNumber: 1, status: 'succeeded', attemptIds: [], startedAt: 't' };
    expect(fanOutView([runWith([visit])], 'scout')).toBeUndefined();
    const view = fanOutView([runWith([activation('a', 0, 'orphaned')])], 'scout')!;
    expect(view.items[0].status).toBe('failed');
  });

  it('renders a compact headline', () => {
    expect(fanOutSummaryLabel({ total: 3, succeeded: 3, failed: 0, running: 0, skipped: 0, items: [] })).toBe('3 of 3 succeeded');
    expect(
      fanOutSummaryLabel({ total: 5, succeeded: 2, failed: 1, running: 2, skipped: 0, items: [] }),
    ).toBe('2 of 5 succeeded · 1 failed · 2 running');
  });
});
