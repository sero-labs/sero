import { describe, expect, it } from 'vitest';
import { activeSessionExecutor } from '../executors/active-session';
import type { StepRunInput } from '../engine-types';
import type { Loop, LoopRun, SessionTarget } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { seedActiveLoop } from './fixtures';
import type { LoopPlan } from '../../shared/types';

function sessionPlan(target: SessionTarget): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'talk to the session',
    steps: [{ id: 'step-1', title: 'Ask', instructions: 'Do the thing in the live session.', execution: { type: 'active-session', sessionTarget: target } }],
  };
}

const target = (overrides: Partial<SessionTarget> = {}): SessionTarget => ({
  workspaceId: 'ws-1',
  strategy: 'most-recent-active',
  deliverAs: 'steer',
  triggerTurn: true,
  ...overrides,
});

function inputFor(host: FakeHost, loop: Loop): StepRunInput {
  const run: LoopRun = { id: 'r1', runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't' };
  return { host, loop, run, step: loop.plan.steps[0], attemptNumber: 1, parentSessionId: loop.runtime.parentSessionId };
}

describe('activeSessionExecutor', () => {
  it('sends to the resolved active session and records the turn once', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sessionPlan(target()));
    const attempt = await activeSessionExecutor.run(inputFor(host, loop));

    expect(host.sessionSends).toEqual([{ sessionId: 'sess-1', kind: 'steer' }]);
    expect(attempt.resolvedSessionId).toBe('sess-1');
    expect(attempt.sessionTurnId).toBe('turn-1');
    expect(attempt.outcome?.status).toBe('succeeded');
  });

  it('uses a context message for next-turn delivery', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sessionPlan(target({ deliverAs: 'nextTurn', triggerTurn: false })));
    const attempt = await activeSessionExecutor.run(inputFor(host, loop));
    expect(host.sessionSends).toEqual([{ sessionId: 'sess-1', kind: 'context' }]);
    // No turn triggered -> no turnId, but the message was delivered.
    expect(attempt.sessionTurnId).toBeUndefined();
    expect(attempt.outcome?.status).toBe('succeeded');
  });

  it('fails when no active session is available', async () => {
    const host = createFakeHost();
    host.activeSession = null;
    const loop = seedActiveLoop(host, sessionPlan(target()));
    const attempt = await activeSessionExecutor.run(inputFor(host, loop));
    expect(attempt.status).toBe('failed');
    expect(attempt.error).toContain('no active session');
  });

  it('records an aborted/errored turn as a failed outcome', async () => {
    const host = createFakeHost();
    host.turnResult = { turnId: 'turn-9', status: 'error' };
    const loop = seedActiveLoop(host, sessionPlan(target()));
    const attempt = await activeSessionExecutor.run(inputFor(host, loop));
    expect(attempt.outcome?.status).toBe('failed');
    expect(attempt.sessionTurnId).toBe('turn-9');
  });

  it('resolves a specific session id when requested', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sessionPlan(target({ strategy: 'specific-session', sessionId: 'sess-specific' })));
    const attempt = await activeSessionExecutor.run(inputFor(host, loop));
    expect(attempt.resolvedSessionId).toBe('sess-specific');
  });
});
