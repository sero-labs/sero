import { describe, expect, it } from 'vitest';
import type { LoopRunSummary } from '../../shared/types';
import { summarizeRun } from '../lib/run-summary';

const step = (status: string, outcomeStatus?: string) =>
  ({ stepId: 's', attemptNumber: 1, executionType: 'background-agent', status, outcomeStatus } as LoopRunSummary['steps'][number]);

const run = (over: Partial<LoopRunSummary>): LoopRunSummary =>
  ({ id: 'r', runNumber: 1, status: 'completed', startedAt: 't', steps: [], recoveries: [], ...over } as LoopRunSummary);

describe('summarizeRun', () => {
  it('counts step outcomes and maps succeeded/needs-revision to friendly labels', () => {
    const summary = summarizeRun(run({
      steps: [step('completed', 'succeeded'), step('completed', 'succeeded'), step('completed', 'blocked')],
    }));
    expect(summary).toBe('2 done · 1 blocked');
  });

  it('appends a recovery count', () => {
    const summary = summarizeRun(run({
      steps: [step('completed', 'needs-revision')],
      recoveries: [{ decision: 'retry-step', reason: 'x' }],
    }));
    expect(summary).toBe('1 recovering · 1 recovery');
  });

  it('falls back to the mechanical status when no outcome is recorded', () => {
    expect(summarizeRun(run({ steps: [step('failed')] }))).toBe('1 failed');
  });

  it('reads "no steps run" for an empty run', () => {
    expect(summarizeRun(run({}))).toBe('no steps run');
  });
});
