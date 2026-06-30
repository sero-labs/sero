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

  it('ignores an unrelated turn completion and matches its own turn id', async () => {
    const host = createFakeHost();
    host.turnResult = { turnId: 'turn-expected', status: 'completed' };
    // The bridge delivers an unrelated turn's completion first, then ours.
    host.session.onTurnComplete = (_sessionId, cb) => {
      setTimeout(() => cb({ turnId: 'turn-other', status: 'completed' }), 0);
      setTimeout(() => cb({ turnId: 'turn-expected', status: 'completed' }), 0);
      return () => {};
    };
    const loop = seedActiveLoop(host, sessionPlan(target()));
    const attempt = await activeSessionExecutor.run(inputFor(host, loop));
    expect(attempt.outcome?.status).toBe('succeeded');
    expect(attempt.sessionTurnId).toBe('turn-expected');
  });

  it('fails with a timeout when the live session never finishes its turn', async () => {
    const host = createFakeHost();
    host.frozenNow = '2026-01-01T00:00:00.000Z';
    host.session.onTurnComplete = () => () => {}; // never completes
    const loop = seedActiveLoop(host, sessionPlan(target()));
    loop.limits = { ...loop.limits, maxWallClockMs: 20 };
    const input = inputFor(host, loop);
    input.run.startedAt = host.now();
    const attempt = await activeSessionExecutor.run(input);
    expect(attempt.outcome?.status).toBe('failed');
    expect(attempt.outcome?.summary).toContain('timed out');
    expect(attempt.sessionTurnId).toBeUndefined();
  });

  it('times out promptly when the wall-clock budget is already exhausted', async () => {
    const host = createFakeHost();
    host.frozenNow = '2026-01-01T00:00:00.000Z';
    host.session.onTurnComplete = () => () => {}; // never completes
    const loop = seedActiveLoop(host, sessionPlan(target()));
    loop.limits = { ...loop.limits, maxWallClockMs: 1000 };
    const input = inputFor(host, loop);
    input.run.startedAt = '2025-12-31T23:00:00.000Z'; // an hour ago — budget long gone
    const attempt = await activeSessionExecutor.run(input);
    // Does not grant a fresh fallback window; fails promptly instead.
    expect(attempt.outcome?.status).toBe('failed');
    expect(attempt.outcome?.summary).toContain('timed out');
  });
});
