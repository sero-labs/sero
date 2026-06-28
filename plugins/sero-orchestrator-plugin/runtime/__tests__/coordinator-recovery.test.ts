import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import type { RecoveryDecision } from '../../shared/types';
import { computeReadySteps } from '../readiness';
import { isRetryableLoop } from '../../shared/recovery';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop, sequentialPlan } from './fixtures';

function fail(host: FakeHost, stepId: string) {
  const loop = host.state.loops[0];
  loop.runtime.stepStates[stepId] = { status: 'failed', attempts: 1, outcome: { status: 'failed', summary: 'x' }, updatedAt: 't' };
  host.state = { ...host.state, loops: [loop] };
}

describe('Coordinator.revise (manual)', () => {
  it('applies a validated revised plan (goal unchanged → no schedule call)', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan); // prompt is 'p'
    host.modelResponses.push({ response: JSON.stringify({ goal: 'p', plan: sequentialPlan().plan }) });
    const res = await new Coordinator(host).revise('loop-1', 'split into two steps');
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].plan.steps).toHaveLength(2);
    expect(host.state.loops[0].prompt).toBe('p'); // goal returned verbatim
    expect(host.state.loops[0].revisions.some((r) => r.status === 'applied')).toBe(true);
  });

  it('rejects and records an invalid revised plan', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({ goal: 'p', plan: { schemaVersion: 1, revision: 0, objective: 'o', steps: [] } }) });
    const res = await new Coordinator(host).revise('loop-1');
    expect(res.ok).toBe(false);
    expect(host.state.loops[0].revisions.some((r) => r.status === 'rejected')).toBe(true);
  });

  it('updates the goal and re-derives the schedule when the refinement changes the goal', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    // Existing hourly schedule with run history to preserve.
    loop.triggers = [{ id: 't', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', fireCount: 2, nextFireAt: '2026-01-01T01:00:00.000Z' }];
    host.state = { ...host.state, loops: [loop] };
    // 1) revise returns a NEW goal + plan; 2) the dedicated schedule call derives the new cadence.
    host.modelResponses.push({ response: JSON.stringify({ goal: 'every 10 minutes, do the thing; stop when done', plan: oneStepPlan().plan }) });
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '*/10 * * * *' }) });

    const res = await new Coordinator(host).revise('loop-1', 'run every 10 minutes instead');
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].prompt).toBe('every 10 minutes, do the thing; stop when done');
    const trigger = host.state.loops[0].triggers[0];
    expect(trigger.schedule).toBe('*/10 * * * *'); // cadence updated from the new goal
    expect(trigger.fireCount).toBe(2); // run history preserved
  });
});

describe('Coordinator.chooseRecovery (manual override)', () => {
  it('applies a user-supplied skip decision', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    fail(host, 'step-1');
    const decision: RecoveryDecision = {
      id: 'r1', stepId: 'step-1', failedAttemptId: 'a1', decision: 'skip-step', reason: 'manual skip', createdAt: 't',
    };
    const res = await new Coordinator(host).chooseRecovery('loop-1', decision);
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('skipped');
  });
});

describe('Coordinator.retryLoop', () => {
  function blockStep(host: FakeHost, stepId: string) {
    const loop = host.state.loops[0];
    loop.runtime.stepStates[stepId] = { status: 'blocked', attempts: 1, outcome: { status: 'blocked', summary: 'bad data' }, updatedAt: 't' };
    loop.runtime.completion = { status: 'blocked', final: false, sourceStepId: stepId, sourceAttemptId: 'x', reason: 'bad data', createdAt: 't' };
    host.state = { ...host.state, loops: [loop] };
  }

  it('resets the blocked step, clears the block, and leaves succeeded steps alone', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    loop.runtime.stepStates['a'] = { status: 'succeeded', attempts: 1, outcome: { status: 'succeeded', summary: 'ok' }, updatedAt: 't' };
    host.state = { ...host.state, loops: [loop] };
    blockStep(host, 'b');

    const res = await new Coordinator(host).retryLoop('loop-1');
    expect(res.ok).toBe(true);
    const updated = host.state.loops[0];
    expect(updated.runtime.stepStates['b'].status).toBe('pending');
    expect(updated.runtime.stepStates['b'].outcome).toBeUndefined();
    expect(updated.runtime.stepStates['a'].status).toBe('succeeded'); // prior work kept
    expect(updated.runtime.completion).toBeUndefined();
    expect(updated.status).toBe('active');
  });

  it('restores the recovered step\'s attempt budget so a tight maxAttemptsPerStep cannot block the re-run', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    loop.limits = { ...loop.limits, maxAttemptsPerStep: 1 };
    loop.runtime.stepStates['a'] = { status: 'succeeded', attempts: 1, outcome: { status: 'succeeded', summary: 'ok' }, updatedAt: 't' };
    host.state = { ...host.state, loops: [loop] };
    blockStep(host, 'b'); // blocked, attempts: 1 (== cap)

    const res = await new Coordinator(host).retryLoop('loop-1');
    expect(res.ok).toBe(true);
    const updated = host.state.loops[0];
    expect(updated.runtime.stepStates['b'].status).toBe('pending');
    expect(updated.runtime.stepStates['b'].attempts).toBe(0); // budget restored
    expect(computeReadySteps(updated)).toContain('b'); // genuinely runnable again
  });

  it('rescues a step left pending but out of attempts (the wedge: pending + attempts == cap, no block)', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    loop.limits = { ...loop.limits, maxAttemptsPerStep: 1 };
    loop.runtime.stepStates['a'] = { status: 'succeeded', attempts: 1, outcome: { status: 'succeeded', summary: 'ok' }, updatedAt: 't' };
    // 'b' looks runnable (pending) but already used its one attempt — readiness skips it forever.
    loop.runtime.stepStates['b'] = { status: 'pending', attempts: 1, updatedAt: 't' };
    host.state = { ...host.state, loops: [loop] };

    expect(isRetryableLoop(host.state.loops[0])).toBe(true); // Retry button appears
    expect(computeReadySteps(host.state.loops[0])).not.toContain('b'); // stuck before retry

    const res = await new Coordinator(host).retryLoop('loop-1');
    expect(res.ok).toBe(true);
    const updated = host.state.loops[0];
    expect(updated.runtime.stepStates['b'].attempts).toBe(0);
    expect(computeReadySteps(updated)).toContain('b'); // unwedged
  });

  it('refuses when there is nothing to retry', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).retryLoop('loop-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/nothing to retry/i);
  });

  it('refuses while a run is already in progress', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    blockStep(host, 'step-1');
    host.state.loops[0].runtime.activeRunId = 'run-x';
    const res = await new Coordinator(host).retryLoop('loop-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/in progress/i);
  });
});
