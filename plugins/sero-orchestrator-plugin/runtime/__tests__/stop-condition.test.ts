import { describe, expect, it } from 'vitest';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { evaluateStopCondition } from '../stop-condition';
import type { Loop, LoopRun } from '../../shared/types';

/** Attaches a completed iteration whose single step reported `summary`. */
function withRun(loop: Loop, summary: string): Loop {
  const run: LoopRun = {
    id: 'run-1',
    runNumber: 1,
    status: 'completed',
    startedStepIds: ['step-1'],
    stepAttempts: [
      {
        id: 'a1',
        stepId: 'step-1',
        attemptNumber: 1,
        parentSessionId: 'sess',
        executionType: 'background-agent',
        status: 'completed',
        outcome: { status: 'skipped', summary },
        observations: [],
        startedAt: 't',
        endedAt: 't',
      },
    ],
    recoveryDecisions: [],
    observations: [],
    startedAt: 't',
  };
  return {
    ...loop,
    prompt: 'every hour, resolve one issue; stop when there are no open issues left',
    runs: [run],
    runtime: { ...loop.runtime, variables: { notes: summary } },
  };
}

describe('evaluateStopCondition', () => {
  it('returns stop:true when the model judges the condition met', async () => {
    const host = createFakeHost();
    const loop = withRun(seedActiveLoop(host, oneStepPlan().plan), 'no open issues remain');
    host.modelResponses.push({ response: JSON.stringify({ stop: true, reason: 'no issues left' }) });
    expect(await evaluateStopCondition(host, { loop })).toEqual({ stop: true, reason: 'no issues left' });
  });

  it('returns stop:false when the condition is not met', async () => {
    const host = createFakeHost();
    const loop = withRun(seedActiveLoop(host, oneStepPlan().plan), 'resolved one issue, more remain');
    host.modelResponses.push({ response: JSON.stringify({ stop: false, reason: 'more issues remain' }) });
    expect(await evaluateStopCondition(host, { loop })).toEqual({ stop: false, reason: 'more issues remain' });
  });

  it('repairs a reply missing the stop flag once, then succeeds', async () => {
    const host = createFakeHost();
    const loop = withRun(seedActiveLoop(host, oneStepPlan().plan), 'no issues');
    host.modelResponses.push({ response: JSON.stringify({ reason: 'forgot the stop flag' }) });
    host.modelResponses.push({ response: JSON.stringify({ stop: true, reason: 'done' }) });
    expect(await evaluateStopCondition(host, { loop })).toEqual({ stop: true, reason: 'done' });
  });

  it('falls back to stop:false and persists raw replies when unparseable', async () => {
    const host = createFakeHost();
    const loop = withRun(seedActiveLoop(host, oneStepPlan().plan), 'no issues');
    for (let i = 0; i < 3; i += 1) host.modelResponses.push({ response: '{ garbage' });
    const result = await evaluateStopCondition(host, { loop });
    expect(result.stop).toBe(false);
    expect(host.artifacts.get('artifact://loops/loop-1/artifacts/stop-condition.txt')).toContain('garbage');
  });
});
