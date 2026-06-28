import { describe, expect, it } from 'vitest';
import { appendDigest, buildRunDigest, gatherHistory, readDigests } from '../digest';
import { createFakeHost } from './fake-host';
import { seedActiveLoop, sequentialPlan } from './fixtures';
import type { LoopRun, StepAttempt } from '../../shared/types';

function attempt(over: Partial<StepAttempt> & Pick<StepAttempt, 'stepId'>): StepAttempt {
  return {
    id: `att-${over.stepId}-${over.attemptNumber ?? 1}`,
    parentSessionId: 'p',
    executionType: 'background-agent',
    status: 'completed',
    attemptNumber: 1,
    observations: [],
    startedAt: 't0',
    endedAt: 't1',
    ...over,
  };
}

function run(over: Partial<LoopRun> & Pick<LoopRun, 'runNumber'>): LoopRun {
  return {
    id: `run-${over.runNumber}`,
    status: 'completed',
    startedStepIds: [],
    stepAttempts: [],
    recoveryDecisions: [],
    observations: [],
    startedAt: 't0',
    ...over,
  };
}

describe('buildRunDigest', () => {
  it('compacts a run into per-step records with summed duration and the final status', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    const digest = buildRunDigest(
      loop,
      run({
        runNumber: 2,
        completionSignal: { status: 'complete', sourceStepId: 'b', sourceAttemptId: 'x', reason: 'done', createdAt: 't' },
        stepAttempts: [
          attempt({ stepId: 'a', status: 'failed', outcome: { status: 'failed', summary: 'blew up' }, model: 'LOW', usage: { durationMs: 1200 } }),
          attempt({ stepId: 'a', attemptNumber: 2, outcome: { status: 'succeeded', summary: 'ok now' }, model: 'LOW', usage: { durationMs: 800 } }),
          attempt({ stepId: 'b', outcome: { status: 'succeeded', summary: 'joined' }, model: 'MED' }),
        ],
        recoveryDecisions: [{ id: 'rec', stepId: 'a', failedAttemptId: 'att-a-1', decision: 'retry-step', reason: 'transient', createdAt: 't' }],
      }),
    );

    expect(digest.runNumber).toBe(2);
    expect(digest.completion).toBe('complete');
    const stepA = digest.steps.find((s) => s.id === 'a')!;
    expect(stepA.title).toBe('First');
    expect(stepA.attempts).toBe(2);
    expect(stepA.status).toBe('succeeded'); // last attempt won
    expect(stepA.durationMs).toBe(2000); // summed across attempts
    expect(stepA.failureSummary).toBeUndefined(); // final status is success
    expect(digest.recoveries).toEqual([{ stepId: 'a', decision: 'retry-step', reason: 'transient' }]);
  });

  it('records a failureSummary only for a step that ended failed/blocked', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    const digest = buildRunDigest(
      loop,
      run({ runNumber: 1, status: 'blocked', stepAttempts: [attempt({ stepId: 'b', status: 'failed', outcome: { status: 'blocked', summary: 'cannot proceed' } })] }),
    );
    const stepB = digest.steps.find((s) => s.id === 'b')!;
    expect(stepB.status).toBe('blocked');
    expect(stepB.failureSummary).toBe('cannot proceed');
  });
});

describe('appendDigest / readDigests', () => {
  it('round-trips and trims to the retain count, keeping the most recent', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    for (let n = 1; n <= 5; n += 1) {
      await appendDigest(host, loop.id, buildRunDigest(loop, run({ runNumber: n })), 3);
    }
    const stored = await readDigests(host, loop.id);
    expect(stored.map((d) => d.runNumber)).toEqual([3, 4, 5]);
  });

  it('replaces a digest with the same run number (idempotent re-finalize)', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    await appendDigest(host, loop.id, buildRunDigest(loop, run({ runNumber: 1, status: 'completed' })), 50);
    await appendDigest(host, loop.id, buildRunDigest(loop, run({ runNumber: 1, status: 'failed' })), 50);
    const stored = await readDigests(host, loop.id);
    expect(stored.length).toBe(1);
    expect(stored[0].status).toBe('failed');
  });

  it('returns an empty list when no digest file exists', async () => {
    const host = createFakeHost();
    expect(await readDigests(host, 'never-ran')).toEqual([]);
  });
});

describe('gatherHistory', () => {
  it('merges durable digests with in-memory runs not yet in the file', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    await appendDigest(host, loop.id, buildRunDigest(loop, run({ runNumber: 1 })), 50);
    const withMemoryRun = { ...loop, runs: [run({ runNumber: 2 })] };
    const history = await gatherHistory(host, withMemoryRun);
    expect(history.map((d) => d.runNumber)).toEqual([1, 2]);
  });
});
