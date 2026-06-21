// P-C — measurement / threshold (spec 05 §4.2, §6.2). A threshold criterion runs
// a planner-shaped measurement command, extracts the number(s) mechanically, and
// compares against the LLM-authored threshold; ambiguous output falls back to a
// judge. Validates the page-load<50ms example from spec 05 §9.

import { describe, expect, it } from 'vitest';

import { createHarness, settle, type VerifyFn, type WorkerScript } from './harness';
import { compareThreshold, extractNumbers } from '@plugins/sero-orchestrator-plugin/runtime/measurement';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { Decision, SuccessCriterion, ThresholdAggregate, ThresholdOp } from '@plugins/sero-orchestrator-plugin/shared/types';

describe('P-C — extractNumbers', () => {
  it('parses a bare number, a JSON array, and array-of-objects by metric', () => {
    expect(extractNumbers('47', 'ms')).toEqual([47]);
    expect(extractNumbers('[47, 42, 30]', 'ms')).toEqual([47, 42, 30]);
    expect(extractNumbers('[{"page":"a","ms":47},{"page":"b","ms":42}]', 'ms')).toEqual([47, 42]);
    expect(extractNumbers('{"ms": 33}', 'ms')).toEqual([33]);
  });

  it('parses bare-number lines but treats prose as ambiguous', () => {
    expect(extractNumbers('47\n42\n30', 'ms')).toEqual([47, 42, 30]);
    expect(extractNumbers('about 47 ms, give or take', 'ms')).toEqual([]);
    expect(extractNumbers('', 'ms')).toEqual([]);
  });
});

describe('P-C — compareThreshold', () => {
  const decision = (op: ThresholdOp, value: number, aggregate?: ThresholdAggregate): Extract<Decision, { kind: 'threshold' }> => ({
    kind: 'threshold',
    metric: 'ms',
    op,
    value,
    aggregate,
  });

  it('aggregate "all": passes only when every number passes', () => {
    expect(compareThreshold([47, 42, 30], decision('<', 50)).passed).toBe(true);
    expect(compareThreshold([47, 55, 30], decision('<', 50)).passed).toBe(false);
  });

  it('aggregate "fraction-at-least": passes when enough numbers pass', () => {
    expect(compareThreshold([47, 55, 30], decision('<', 50, { kind: 'fraction-at-least', fraction: 0.6 })).passed).toBe(true);
    expect(compareThreshold([47, 55, 80], decision('<', 50, { kind: 'fraction-at-least', fraction: 0.6 })).passed).toBe(false);
  });

  it('honours each comparison operator', () => {
    expect(compareThreshold([5], decision('>=', 5)).passed).toBe(true);
    expect(compareThreshold([5], decision('>', 5)).passed).toBe(false);
    expect(compareThreshold([5], decision('==', 5)).passed).toBe(true);
  });
});

function thresholdPlanner(
  command: string,
  op: ThresholdOp,
  value: number,
  aggregate?: ThresholdAggregate,
): PlannerRunner {
  const criterion: SuccessCriterion = {
    id: 'fast',
    description: 'every page loads fast',
    evidence: [{ kind: 'run', command }],
    decision: { kind: 'threshold', metric: 'ms', op, value, aggregate },
    required: true,
  };
  return async () => ({ criteria: [criterion], stopConditions: [] });
}

const changeWorker: WorkerScript = () => ({ response: 'done', changedFiles: ['app.ts'] });
const stdoutVerify = (stdout: string): VerifyFn => (command) => ({ command, success: true, stdout, stderr: '', durationMs: 1 });

describe('P-C — threshold criterion end-to-end', () => {
  it('completes when every measured page is under the threshold', async () => {
    const h = createHarness({
      planner: thresholdPlanner('measure', '<', 50),
      runWorker: changeWorker,
      verify: stdoutVerify('[47, 42, 30]'),
    });
    const id = await h.createLoop({ goal: 'every page loads under 50ms' });
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).toBe('complete');
    const result = loop!.attempts.at(-1)!.checkResults[0]!;
    expect(result.decisionKind).toBe('threshold');
    expect(result.status).toBe('passed');
    expect(result.summary).toContain('3/3');
    h.cleanup();
  });

  it('does not complete when a page exceeds the threshold', async () => {
    const h = createHarness({
      planner: thresholdPlanner('measure', '<', 50),
      runWorker: changeWorker,
      verify: stdoutVerify('[47, 55, 30]'),
    });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).not.toBe('complete');
    expect(loop!.attempts.at(-1)!.checkResults[0]!.status).toBe('failed');
    h.cleanup();
  });

  it('falls back to a judge when the measurement is not a clean number', async () => {
    const judgingWorker: WorkerScript = (params) =>
      params.systemPrompt?.includes('verification judge')
        ? { response: '```json\n{"verdict":"pass","summary":"close enough"}\n```' }
        : { response: 'done', changedFiles: ['app.ts'] };
    const h = createHarness({
      planner: thresholdPlanner('measure', '<', 50),
      runWorker: judgingWorker,
      verify: stdoutVerify('it feels fast enough'), // not numeric → judge-fallback
    });
    const id = await h.createLoop();
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).toBe('complete');
    const result = loop!.attempts.at(-1)!.checkResults[0]!;
    expect(result.status).toBe('passed');
    expect(result.summary).toMatch(/judged/i);
    h.cleanup();
  });
});
