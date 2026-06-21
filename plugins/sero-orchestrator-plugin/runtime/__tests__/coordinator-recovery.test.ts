import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import type { RecoveryDecision } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop, sequentialPlan } from './fixtures';

function fail(host: FakeHost, stepId: string) {
  const loop = host.state.loops[0];
  loop.runtime.stepStates[stepId] = { status: 'failed', attempts: 1, outcome: { status: 'failed', summary: 'x' }, updatedAt: 't' };
  host.state = { ...host.state, loops: [loop] };
}

describe('Coordinator.revise (manual)', () => {
  it('applies a validated revised plan', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify(sequentialPlan().plan) });
    const res = await new Coordinator(host).revise('loop-1', 'split into two steps');
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].plan.steps).toHaveLength(2);
    expect(host.state.loops[0].revisions.some((r) => r.status === 'applied')).toBe(true);
  });

  it('rejects and records an invalid revised plan', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({ schemaVersion: 1, revision: 0, objective: 'o', steps: [] }) });
    const res = await new Coordinator(host).revise('loop-1');
    expect(res.ok).toBe(false);
    expect(host.state.loops[0].revisions.some((r) => r.status === 'rejected')).toBe(true);
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
