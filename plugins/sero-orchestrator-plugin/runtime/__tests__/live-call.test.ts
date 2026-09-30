/**
 * A one-answer Orchestrator call is recorded on the loop's runtime while it
 * runs, and cleared when it returns.
 *
 * The fake host snapshots each loop's live call at the moment the host reports
 * the run id, so a test sees the record mid-call rather than after it.
 */

import { describe, expect, it } from 'vitest';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { clearLiveCall, markLiveCall } from '../live-call';
import { runTrackedModel } from '../usage-tracking';
import { evaluateStopCondition } from '../stop-condition';
import { proposeImprovements } from '../reflection';
import { proposeSkill } from '../skill-extract';
import { extractTriggers } from '../trigger-extractor';
import { evaluateEventCondition } from '../event-condition';
import { llmDecider, llmEvaluator, proposeRevisedPlan } from '../llm-decisions';
import { planLoop } from '../planner';
import type { LiveCall, LiveCallKind, Loop, StepAttempt } from '../../shared/types';

function liveCallOf(host: ReturnType<typeof createFakeHost>, loopId: string): LiveCall | undefined {
  return host.state.loops.find((loop) => loop.id === loopId)?.runtime.liveCall;
}

/** A failed attempt, as the evaluator and the recovery decider see it. */
function pendingAttempt(loop: Loop): StepAttempt {
  return {
    id: 'attempt-1',
    stepId: 'step-1',
    attemptNumber: 1,
    parentSessionId: loop.runtime.parentSessionId,
    executionType: 'background-agent',
    status: 'failed',
    observations: [],
    outputPath: 'artifact://loop-1/step-1-a1.txt',
    startedAt: 't',
    endedAt: 't',
    error: 'the build failed',
  };
}

describe('live call on the loop runtime', () => {
  it('records the call while it runs and clears it when it returns', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);

    await markLiveCall(host, { loopId: loop.id, kind: 'planner' }, 'run-7');
    expect(liveCallOf(host, loop.id)).toEqual({ kind: 'planner', runId: 'run-7' });

    await clearLiveCall(host, loop.id);
    expect(liveCallOf(host, loop.id)).toBeUndefined();
  });

  it('takes the run id from the run’s own first observation', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: 'done' });

    await runTrackedModel(
      host,
      { task: 'work', parentSessionId: loop.runtime.parentSessionId },
      undefined,
      { loop: { loopId: loop.id, kind: 'reflect' } },
    );

    expect(host.liveCallDuringRun[0]).toEqual({ kind: 'reflect', runId: 'run-1' });
    expect(liveCallOf(host, loop.id)).toBeUndefined();
  });

  it('clears the call even when the model call fails', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: '', error: 'transport failed' });

    await runTrackedModel(
      host,
      { task: 'work', parentSessionId: loop.runtime.parentSessionId },
      undefined,
      { loop: { loopId: loop.id, kind: 'stop' } },
    );

    expect(liveCallOf(host, loop.id)).toBeUndefined();
  });

  const entries: Array<{ kind: LiveCallKind; run: (host: ReturnType<typeof createFakeHost>, loop: Loop) => Promise<unknown> }> = [
    {
      kind: 'planner',
      run: (host) => planLoop(host, {
        loopId: 'loop-1',
        prompt: 'do something',
        parentSessionId: 'orchestrator:ws-1:loop-1',
        useManagedWorktree: false,
        delivery: { destination: 'workspace-files' },
      }),
    },
    {
      kind: 'trigger',
      run: (host, loop) => extractTriggers(host, {
        prompt: 'every hour',
        parentSessionId: loop.runtime.parentSessionId,
        loopId: loop.id,
      }),
    },
    {
      kind: 'refine',
      run: (host, loop) => proposeRevisedPlan(host, loop, 'stop earlier'),
    },
    {
      kind: 'reflect',
      run: (host, loop) => proposeImprovements(host, loop, []),
    },
    {
      kind: 'skill',
      run: (host, loop) => proposeSkill(host, loop, []),
    },
    {
      kind: 'evaluator',
      run: (host, loop) => llmEvaluator.evaluate({
        host,
        loop,
        step: loop.plan.steps[0],
        attempt: pendingAttempt(loop),
      }),
    },
    {
      kind: 'recovery',
      run: (host, loop) => llmDecider.decide({
        host,
        loop,
        step: loop.plan.steps[0],
        attempt: pendingAttempt(loop),
        outcome: { status: 'failed', summary: 'the build failed' },
      }),
    },
    {
      kind: 'stop',
      run: (host, loop) => evaluateStopCondition(host, { loop }),
    },
    {
      kind: 'event',
      run: (host, loop) => evaluateEventCondition(
        host,
        loop,
        { id: 'trigger-1', kind: 'event', eventSource: 'github:pull-request' } as never,
        {
          id: 'event-1',
          source: 'github:pull-request',
          payload: { number: 612 },
          occurredAt: 't',
          summary: 'pull request #612 opened',
        },
      ),
    },
  ];

  for (const entry of entries) {
    it(`records and clears the ${entry.kind} call`, async () => {
      const host = createFakeHost();
      const loop = seedActiveLoop(host, oneStepPlan().plan);
      host.modelResponses.push({ response: '{}' });

      await entry.run(host, loop).catch(() => undefined);

      expect(host.liveCallDuringRun[0]).toMatchObject({ kind: entry.kind, runId: 'run-1' });
      expect(liveCallOf(host, loop.id)).toBeUndefined();
    });
  }
});
